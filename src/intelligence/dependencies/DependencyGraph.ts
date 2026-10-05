/** File-level dependency graph (imports/exports), incremental. */
export class DependencyGraph {
  private edges = new Map<string, Set<string>>(); // file -> depends-on (import names / resolved paths)
  private reverse = new Map<string, Set<string>>();

  setDependencies(file: string, deps: string[]): void {
    const prev = this.edges.get(file) ?? new Set();
    for (const d of prev) this.reverse.get(d)?.delete(file);
    const next = new Set(deps);
    this.edges.set(file, next);
    for (const d of next) {
      let set = this.reverse.get(d);
      if (!set) {
        set = new Set();
        this.reverse.set(d, set);
      }
      set.add(file);
    }
  }

  remove(file: string): void {
    const deps = this.edges.get(file);
    if (deps) for (const d of deps) this.reverse.get(d)?.delete(file);
    this.edges.delete(file);
    this.reverse.delete(file);
    for (const [, set] of this.reverse) set.delete(file);
  }

  dependenciesOf(file: string): string[] {
    return [...(this.edges.get(file) ?? [])];
  }

  dependentsOf(dep: string): string[] {
    return [...(this.reverse.get(dep) ?? [])];
  }

  /** Files transitively affected by a change to `file` (bounded BFS). */
  affectedFiles(file: string, maxDepth = 3): string[] {
    const seen = new Set<string>([file]);
    let frontier = [file];
    for (let d = 0; d < maxDepth; d++) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const dep of this.dependentsOf(f)) {
          if (!seen.has(dep)) {
            seen.add(dep);
            next.push(dep);
          }
        }
        // also resolve by basename match (import name -> file)
        for (const [candidate, deps] of this.edges) {
          if (seen.has(candidate)) continue;
          const base = candidate.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
          if ([...deps].includes(base) && f.includes(base)) {
            seen.add(candidate);
            next.push(candidate);
          }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    seen.delete(file);
    return [...seen];
  }
}
