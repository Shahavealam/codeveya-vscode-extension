import { execFile } from 'child_process';

export interface RipgrepHit {
  file: string;
  line: number;
  text: string;
}

/** ripgrep-backed search; falls back gracefully when rg is unavailable. */
export class RipgrepSearch {
  constructor(private readonly root: string) {}

  available(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('rg', ['--version'], (err) => resolve(!err));
    });
  }

  search(query: string, limit = 30): Promise<RipgrepHit[]> {
    return new Promise((resolve) => {
      execFile(
        'rg',
        ['--no-heading', '--line-number', '--max-count', String(limit), '--hidden', '--glob', '!.git', query, this.root],
        { timeout: 5000, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err && !stdout) {
            resolve([]);
            return;
          }
          const hits: RipgrepHit[] = [];
          for (const line of stdout.split('\n')) {
            const m = line.match(/^(.*?):(\d+):(.*)$/);
            if (m) hits.push({ file: m[1], line: Number(m[2]), text: m[3].slice(0, 300) });
            if (hits.length >= limit) break;
          }
          resolve(hits);
        },
      );
    });
  }
}
