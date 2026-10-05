import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { FileSkeleton, SymbolRecord } from '../../agent/AgentProtocol';
import { languageOf, loadIgnoreRules, shouldIgnore, isSupportedLanguage } from './ignoreRules';
import { TreeSitterParser } from '../parser/TreeSitterParser';
import { SkeletonExtractor } from '../parser/SkeletonExtractor';
import { SymbolIndex } from '../symbols/SymbolIndex';
import { DependencyGraph } from '../dependencies/DependencyGraph';

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export interface IndexStats {
  filesIndexed: number;
  version: number;
  durationMs: number;
}

/** Incremental local repository index. Never runs on UI thread (called async). */
export class WorkspaceIndexer {
  readonly symbols = new SymbolIndex();
  readonly graph = new DependencyGraph();
  readonly skeletons = new Map<string, FileSkeleton>();
  private parser = new TreeSitterParser();
  private extractor = new SkeletonExtractor();
  version = 0;

  constructor(
    private readonly root: string,
    private readonly concurrency = 4,
    private readonly extraIgnores: string[] = [],
  ) {}

  async fullIndex(onProgress?: (done: number, total: number) => void): Promise<IndexStats> {
    const t0 = Date.now();
    const rules = loadIgnoreRules(this.root, this.extraIgnores);
    const files = this.discover(rules);
    let done = 0;
    // bounded concurrency via chunked workers
    const queue = [...files];
    const workers: Array<Promise<void>> = [];
    const lanes = Math.max(1, Math.min(this.concurrency, 8));
    for (let i = 0; i < lanes; i++) {
      workers.push(
        (async () => {
          while (queue.length) {
            const f = queue.pop()!;
            await this.indexFile(f);
            done += 1;
            onProgress?.(done, files.length);
          }
        })(),
      );
    }
    await Promise.all(workers);
    this.version += 1;
    return { filesIndexed: files.length, version: this.version, durationMs: Date.now() - t0 };
  }

  discover(rules = loadIgnoreRules(this.root, this.extraIgnores)): string[] {
    const out: string[] = [];
    const stack = [this.root];
    while (stack.length) {
      const dir = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(this.root, full);
        if (shouldIgnore(rel, rules)) continue;
        if (e.isDirectory()) stack.push(full);
        else if (e.isFile() && isSupportedLanguage(full)) {
          out.push(full);
          if (out.length > 20000) return out;
        }
      }
    }
    return out;
  }

  async indexFile(absPath: string): Promise<void> {
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf8');
      if (content.length > 500_000) return; // skip huge files
    } catch {
      return;
    }
    const rel = path.relative(this.root, absPath);
    const parsed = this.parser.parse(absPath, content);
    const skeleton = this.extractor.extract(rel, parsed);
    this.skeletons.set(rel, skeleton);
    const records: SymbolRecord[] = [
      ...parsed.classes.map((name, i) => ({ name, kind: 'class', file: rel, line: i })),
      ...parsed.functions.map((f) => ({ name: f.name, kind: 'function', file: rel, signature: f.signature, line: 0 })),
      ...parsed.methods.map((m) => ({ name: m.name, kind: 'method', file: rel, signature: m.signature, line: 0 })),
    ];
    this.symbols.upsert({
      filePath: rel,
      hash: hashContent(content),
      language: languageOf(absPath),
      skeletonIndex: 0,
      symbols: records,
      imports: parsed.imports,
      updatedAt: Date.now(),
    });
    this.graph.setDependencies(rel, parsed.imports);
  }

  async updateFile(absPath: string, affectedInvalidation?: (files: string[]) => void): Promise<void> {
    await this.indexFile(absPath);
    const rel = path.relative(this.root, absPath);
    const affected = this.graph.affectedFiles(rel);
    if (affected.length) affectedInvalidation?.(affected);
    this.version += 1;
  }

  removeFile(absPath: string): void {
    const rel = path.relative(this.root, absPath);
    this.skeletons.delete(rel);
    this.symbols.remove(rel);
    this.graph.remove(rel);
    this.version += 1;
  }

  getSkeleton(rel: string): FileSkeleton | undefined {
    return this.skeletons.get(rel);
  }
}
