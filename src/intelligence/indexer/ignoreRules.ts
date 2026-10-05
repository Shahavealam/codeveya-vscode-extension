import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'target',
  'vendor',
];

export const SECRET_FILE_PATTERNS = [/^\.env(\..*)?$/, /.*\.pem$/, /.*\.key$/, /credentials.*\.json$/i];

export interface IgnoreRules {
  patterns: string[];
  aiignore: string[];
}

/** Loads .gitignore + .aiignore + defaults; pure logic is unit-testable. */
export function loadIgnoreRules(workspaceRoot: string, extra: string[] = []): IgnoreRules {
  const patterns = [...DEFAULT_IGNORES, ...extra];
  const aiignore: string[] = [];
  for (const name of ['.aiignore', '.gitignore']) {
    try {
      const raw = fs.readFileSync(path.join(workspaceRoot, name), 'utf8');
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        if (name === '.aiignore') aiignore.push(t);
        else patterns.push(t);
      }
    } catch {
      // missing file — ignore
    }
  }
  return { patterns, aiignore };
}

export function shouldIgnore(relPath: string, rules: IgnoreRules): boolean {
  const base = path.basename(relPath);
  if (SECRET_FILE_PATTERNS.some((re) => re.test(base) || re.test(relPath))) return true;
  const all = [...rules.patterns, ...rules.aiignore];
  for (const pat of all) {
    const p = pat.replace(/\/$/, '');
    if (relPath === p || relPath.startsWith(p + '/') || relPath.includes(`/${p}/`)) return true;
    if (pat.includes('*')) {
      const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      if (re.test(relPath) || re.test(base)) return true;
    }
  }
  // binaries
  if (/\.(png|jpe?g|gif|ico|pdf|zip|exe|dll|so|dylib|woff2?|ttf)$/i.test(relPath)) return true;
  return false;
}

export function isSupportedLanguage(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php|json|md)$/i.test(filePath);
}

export function languageOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    default:
      return ext.replace('.', '') || 'unknown';
  }
}
