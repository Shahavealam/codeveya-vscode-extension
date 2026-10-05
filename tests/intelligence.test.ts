import { describe, it, expect } from 'vitest';
import { TreeSitterParser } from '../src/intelligence/parser/TreeSitterParser';
import { SkeletonExtractor } from '../src/intelligence/parser/SkeletonExtractor';
import { SymbolIndex } from '../src/intelligence/symbols/SymbolIndex';
import { DependencyGraph } from '../src/intelligence/dependencies/DependencyGraph';
import { loadIgnoreRules, shouldIgnore } from '../src/intelligence/indexer/ignoreRules';

const SAMPLE = `
import { UserRepository } from './repo';
import TokenService from './tokens';
/** Auth service */
export class AuthService {
  token!: string;
  async login(email: string, password: string): Promise<string> { return email + password; }
  async refresh(token: string): Promise<string> { return token; }
}
export function helper(a: number): number { return a; }
`;

describe('skeleton extraction', () => {
  it('extracts classes/methods without bodies', () => {
    const parsed = new TreeSitterParser().parse('src/auth/AuthService.ts', SAMPLE);
    expect(parsed.classes).toContain('AuthService');
    expect(parsed.imports).toContain('UserRepository');
    const sk = new SkeletonExtractor().extract('src/auth/AuthService.ts', parsed);
    expect(sk.filePath).toBe('src/auth/AuthService.ts');
    expect(sk.methods.some((m) => m.name === 'login')).toBe(true);
    const text = new SkeletonExtractor().renderText(sk);
    expect(text).toContain('AuthService');
    expect(text).not.toContain('return email');
  });
});

describe('symbol indexing', () => {
  it('upserts and removes per-file symbols', () => {
    const idx = new SymbolIndex();
    idx.upsert({ filePath: 'a.ts', hash: 'h1', language: 'typescript', skeletonIndex: 0, symbols: [{ name: 'Foo', kind: 'class', file: 'a.ts', line: 0 }], imports: [], updatedAt: 0 });
    expect(idx.lookup('Foo')).toHaveLength(1);
    expect(idx.search('fo')).toHaveLength(1);
    idx.upsert({ filePath: 'a.ts', hash: 'h2', language: 'typescript', skeletonIndex: 0, symbols: [{ name: 'Bar', kind: 'class', file: 'a.ts', line: 0 }], imports: [], updatedAt: 0 });
    expect(idx.lookup('Foo')).toHaveLength(0);
    expect(idx.lookup('Bar')).toHaveLength(1);
    idx.remove('a.ts');
    expect(idx.fileCount()).toBe(0);
  });
});

describe('dependency indexing', () => {
  it('tracks affected files', () => {
    const g = new DependencyGraph();
    g.setDependencies('a.ts', ['b']);
    g.setDependencies('b.ts', []);
    expect(g.affectedFiles('b')).toContain('a.ts');
    g.remove('a.ts');
    expect(g.dependentsOf('b')).toHaveLength(0);
  });
});

describe('ignore rules', () => {
  it('ignores defaults, secrets and aiignore', () => {
    const rules = { patterns: ['node_modules', 'dist'], aiignore: ['private/'] };
    expect(shouldIgnore('node_modules/foo/index.js', rules)).toBe(true);
    expect(shouldIgnore('.env', rules)).toBe(true);
    expect(shouldIgnore('key.pem', rules)).toBe(true);
    expect(shouldIgnore('private/notes.ts', rules)).toBe(true);
    expect(shouldIgnore('src/app.ts', rules)).toBe(false);
    expect(typeof loadIgnoreRules).toBe('function');
  });
});
