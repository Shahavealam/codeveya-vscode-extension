// Tree-sitter facade. Uses regex-based structural extraction so the extension
// works without native tree-sitter bindings; swap in real tree-sitter WASM
// queries behind this interface later without changing callers.

export interface ParsedStructure {
  imports: string[];
  exports: string[];
  classes: string[];
  interfaces: string[];
  types: string[];
  enums: string[];
  functions: Array<{ name: string; signature: string }>;
  methods: Array<{ owner: string; name: string; signature: string }>;
  decorators: string[];
  publicFields: Array<{ owner: string; name: string }>;
}

const IMPORT_RE = /import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))?\s*(?:from\s+)?['"]([^'"]+)['"]/g;
const EXPORT_RE = /export\s+(?:default\s+)?(?:class|function|interface|type|enum|const|let|var)\s+(\w+)/g;
const CLASS_RE = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
const INTERFACE_RE = /(?:export\s+)?interface\s+(\w+)/g;
const TYPE_RE = /(?:export\s+)?type\s+(\w+)/g;
const ENUM_RE = /(?:export\s+)?enum\s+(\w+)/g;
const FUNC_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
const METHOD_RE = /^\s*(?:public\s+|async\s+)*(get\s+|set\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{\n;]+))?\s*\{/gm;
const DECORATOR_RE = /@(\w+)/g;
const FIELD_RE = /^\s*(?:public\s+)?(?:readonly\s+)?(\w+)\s*[:=]/gm;

export class TreeSitterParser {
  parse(filePath: string, content: string): ParsedStructure {
    const imports = new Set<string>();
    let m: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(content))) {
      const named = m[1]?.split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!) ?? [];
      if (m[2]) named.push(m[2]);
      for (const n of named) if (n) imports.add(n);
      if (!m[1] && !m[2] && m[3]) imports.add(m[3].split('/').pop()!);
    }
    const collect = (re: RegExp): string[] => {
      const out: string[] = [];
      re.lastIndex = 0;
      let x: RegExpExecArray | null;
      while ((x = re.exec(content))) out.push(x[1]);
      return out;
    };
    const classes = collect(CLASS_RE);
    const funcs: ParsedStructure['functions'] = [];
    FUNC_RE.lastIndex = 0;
    while ((m = FUNC_RE.exec(content))) {
      funcs.push({ name: m[1], signature: `${m[1]}(${m[2].trim()})` });
    }
    // naive owner tracking: last seen class
    const methods: ParsedStructure['methods'] = [];
    const lines = content.split('\n');
    let owner = '';
    for (const cls of classes) {
      void cls;
    }
    for (const line of lines) {
      const cm = line.match(/class\s+(\w+)/);
      if (cm) owner = cm[1];
    }
    METHOD_RE.lastIndex = 0;
    while ((m = METHOD_RE.exec(content))) {
      const name = m[2];
      if (['if', 'for', 'while', 'switch', 'catch'].includes(name)) continue;
      methods.push({
        owner,
        name,
        signature: `${name}(${m[3].trim()})${m[4] ? `: ${m[4].trim()}` : ''}`,
      });
    }
    const decorators = collect(DECORATOR_RE);
    const publicFields: ParsedStructure['publicFields'] = [];
    FIELD_RE.lastIndex = 0;
    while ((m = FIELD_RE.exec(content))) {
      if (m[1].startsWith('_') || m[1] === 'import') continue;
      publicFields.push({ owner, name: m[1] });
      if (publicFields.length > 200) break;
    }
    return {
      imports: [...imports].slice(0, 100),
      exports: collect(EXPORT_RE).slice(0, 100),
      classes: classes.slice(0, 100),
      interfaces: collect(INTERFACE_RE).slice(0, 100),
      types: collect(TYPE_RE).slice(0, 100),
      enums: collect(ENUM_RE).slice(0, 100),
      functions: funcs.slice(0, 200),
      methods: methods.slice(0, 300),
      decorators: [...new Set(decorators)].slice(0, 50),
      publicFields: publicFields.slice(0, 200),
    };
  }
}
