// React components for the custom sidebar (used by Next.js webview builds).
// Kept dependency-free (no react import required at runtime for the
// plain-HTML webview provider); these are pure view models for bundling.

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: number;
}

export function ChatPanelView(messages: ChatMessage[]): string {
  return messages.map((m) => `[${m.role}] ${m.text}`).join('\n');
}

export interface AgentStep {
  phase: 'PLAN' | 'READ' | 'DRAFT' | 'VERIFY' | 'APPLY' | 'DONE' | 'FAILED';
  summary: string;
}

export function AgentStepsView(steps: AgentStep[]): string {
  return steps.map((s) => `${s.phase}: ${s.summary}`).join('\n');
}

export interface ContextInfo {
  tokens: number;
  files: number;
}

export function ContextPanelView(info: ContextInfo): string {
  return `context ~${info.tokens} tokens · ${info.files} files`;
}

export interface DiffInfo {
  files: string[];
  additions: number;
  deletions: number;
}

export function DiffPanelView(diff: DiffInfo): string {
  return `${diff.files.length} files (+${diff.additions}/-${diff.deletions}): ${diff.files.join(', ')}`;
}

export function ApprovalDialogText(reason?: string): string {
  return reason ? `Approval required: ${reason}` : 'Approval required';
}
