const DENY = [/rm\s+-rf\s+\//, /:\(\)\s*\{/, /mkfs/, /shutdown/, /poweroff/, /format\s+[a-z]:/i];

const ALLOW_PREFIX = ['npm', 'yarn', 'pnpm', 'npx', 'node', 'python', 'pytest', 'tsc', 'eslint', 'git', 'go', 'cargo'];

/**
 * LLM -> backend tool request -> policy -> optional user approval -> extension execution.
 * The extension NEVER executes arbitrary shell commands on LLM request.
 */
export class CommandPolicy {
  constructor(private readonly requireApproval: boolean = true) {}

  evaluate(command: string): { allowed: boolean; needsApproval: boolean; reason: string } {
    const cmd = command.trim();
    if (!cmd) return { allowed: false, needsApproval: false, reason: 'empty command' };
    if (DENY.some((re) => re.test(cmd))) return { allowed: false, needsApproval: false, reason: 'denied pattern' };
    const base = cmd.split(/\s+/)[0];
    const known = ALLOW_PREFIX.some((p) => base === p || base.endsWith(`/${p}`));
    if (!known) return { allowed: false, needsApproval: true, reason: `unknown command: ${base}` };
    return { allowed: true, needsApproval: this.requireApproval, reason: 'ok' };
  }
}
