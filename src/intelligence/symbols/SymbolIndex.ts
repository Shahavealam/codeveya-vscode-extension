import type { SymbolRecord } from '../../agent/AgentProtocol';

export interface IndexedFile {
  filePath: string;
  hash: string;
  language: string;
  skeletonIndex: number;
  symbols: SymbolRecord[];
  imports: string[];
  updatedAt: number;
}

/** In-memory symbol index with incremental per-file updates. */
export class SymbolIndex {
  private files = new Map<string, IndexedFile>();
  private byName = new Map<string, SymbolRecord[]>();
  version = 0;

  upsert(entry: IndexedFile): void {
    const prev = this.files.get(entry.filePath);
    if (prev) {
      for (const s of prev.symbols) {
        const arr = this.byName.get(s.name);
        if (arr) {
          const filtered = arr.filter((r) => r.file !== entry.filePath);
          if (filtered.length) this.byName.set(s.name, filtered);
          else this.byName.delete(s.name);
        }
      }
    }
    this.files.set(entry.filePath, entry);
    for (const s of entry.symbols) {
      const arr = this.byName.get(s.name) ?? [];
      arr.push(s);
      this.byName.set(s.name, arr);
    }
    this.version += 1;
  }

  remove(filePath: string): void {
    const prev = this.files.get(filePath);
    if (!prev) return;
    this.files.delete(filePath);
    for (const s of prev.symbols) {
      const arr = (this.byName.get(s.name) ?? []).filter((r) => r.file !== filePath);
      if (arr.length) this.byName.set(s.name, arr);
      else this.byName.delete(s.name);
    }
    this.version += 1;
  }

  lookup(name: string): SymbolRecord[] {
    return [...(this.byName.get(name) ?? [])];
  }

  search(query: string, limit = 20): SymbolRecord[] {
    const q = query.toLowerCase();
    const out: SymbolRecord[] = [];
    for (const [name, recs] of this.byName) {
      if (name.toLowerCase().includes(q)) out.push(...recs);
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }

  fileCount(): number {
    return this.files.size;
  }

  getFile(filePath: string): IndexedFile | undefined {
    return this.files.get(filePath);
  }
}
