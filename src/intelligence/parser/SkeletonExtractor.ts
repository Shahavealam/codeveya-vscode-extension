import type { FileSkeleton } from '../../agent/AgentProtocol';
import { languageOf } from '../indexer/ignoreRules';
import type { ParsedStructure } from './TreeSitterParser';

/** Builds compact skeletons (no implementation bodies) for context transmission. */
export class SkeletonExtractor {
  extract(filePath: string, parsed: ParsedStructure, docComments: string[] = []): FileSkeleton {
    void docComments;
    return {
      filePath,
      language: languageOf(filePath),
      imports: parsed.imports,
      exports: parsed.exports,
      classes: parsed.classes,
      interfaces: parsed.interfaces,
      types: parsed.types,
      enums: parsed.enums,
      functions: parsed.functions.map((f) => ({ name: f.name, signature: f.signature })),
      methods: parsed.methods.map((m) => ({
        owner: m.owner,
        name: m.name,
        signature: m.signature,
      })),
      decorators: parsed.decorators,
      publicFields: parsed.publicFields,
    };
  }

  renderText(s: FileSkeleton): string {
    const lines = [`FILE: ${s.filePath}`, '', `IMPORTS:\n${s.imports.map((i) => `  ${i}`).join('\n') || '  (none)'}`];
    for (const cls of s.classes) {
      lines.push('', `CLASS:\n  ${cls}`);
      const methods = s.methods.filter((m) => m.owner === cls);
      if (methods.length) {
        lines.push('', 'METHODS:');
        for (const m of methods) lines.push(`  ${m.signature}`);
      }
    }
    if (s.functions.length) {
      lines.push('', 'FUNCTIONS:');
      for (const f of s.functions) lines.push(`  ${f.signature}`);
    }
    if (s.imports.length || s.classes.length) {
      lines.push('', `DEPENDENCIES:\n${s.imports.map((i) => `  ${i}`).join('\n')}`);
    }
    return lines.join('\n');
  }
}
