import type { DiagnosticSummary } from '../agent/AgentProtocol';

/** Compresses/dedupes VS Code diagnostics before transmission (token savings). */
export class DiagnosticsService {
  summarize(
    diagnostics: Array<{ file: string; severity: string; message: string; line: number }>,
    limit = 30,
  ): DiagnosticSummary[] {
    const seen = new Set<string>();
    const out: DiagnosticSummary[] = [];
    for (const d of diagnostics) {
      const key = `${d.file}:${d.line}:${d.message.slice(0, 120)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...d, message: d.message.slice(0, 300) });
      if (out.length >= limit) break;
    }
    return out;
  }
}
