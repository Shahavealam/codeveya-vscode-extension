import * as crypto from 'crypto';
import * as fs from 'fs';

/** Safe file reads with size caps; avoids repeated reads via mtime cache. */
export class FileService {
  private mtimeCache = new Map<string, { mtime: number; content: string }>();
  constructor(private readonly maxBytes = 500_000) {}

  readFile(absPath: string): string | null {
    try {
      const stat = fs.statSync(absPath);
      if (stat.size > this.maxBytes) return null;
      const cached = this.mtimeCache.get(absPath);
      if (cached && cached.mtime === stat.mtimeMs) return cached.content;
      const content = fs.readFileSync(absPath, 'utf8');
      this.mtimeCache.set(absPath, { mtime: stat.mtimeMs, content });
      if (this.mtimeCache.size > 500) {
        const first = this.mtimeCache.keys().next().value as string;
        this.mtimeCache.delete(first);
      }
      return content;
    } catch {
      return null;
    }
  }

  hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  hashFile(absPath: string): string | null {
    const c = this.readFile(absPath);
    return c === null ? null : this.hash(c);
  }
}
