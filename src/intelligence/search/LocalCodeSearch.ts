import * as fs from 'fs';
import * as path from 'path';
import { SymbolIndex } from '../symbols/SymbolIndex';

/** Fast lexical search over indexed skeletons/symbols + file contents (lazy reads). */
export class LocalCodeSearch {
  constructor(
    private readonly root: string,
    private readonly symbols: SymbolIndex,
  ) {}

  searchSymbols(query: string, limit = 20) {
    return this.symbols.search(query, limit);
  }

  /** Substring search across file names first, then bounded content scan. */
  async searchFiles(query: string, limit = 20, maxFilesScanned = 400): Promise<string[]> {
    const q = query.toLowerCase();
    const results: string[] = [];
    const queue: string[] = [this.root];
    let scanned = 0;
    while (queue.length && results.length < limit && scanned < maxFilesScanned) {
      const dir = queue.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'out') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) queue.push(full);
        else if (e.isFile()) {
          scanned += 1;
          if (e.name.toLowerCase().includes(q)) {
            results.push(path.relative(this.root, full));
            if (results.length >= limit) break;
          }
        }
      }
    }
    return results;
  }
}
