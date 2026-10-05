// Shared JSON-RPC 2.0 + agent protocol types.
// The Python Deep Agent backend MUST implement these shapes.

export type JsonRpcId = string | number;

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcSuccess | JsonRpcErrorResponse | JsonRpcNotification;

// ---- Agent task params ----

export interface DiagnosticSummary {
  file: string;
  severity: string;
  message: string;
  line: number;
}

export interface TaskContext {
  selectedFiles: string[];
  selectedSymbols: string[];
  diagnostics: DiagnosticSummary[];
  skeletons: FileSkeleton[];
  symbols: SymbolRecord[];
  gitStatus?: string;
  gitDiffSummary?: string;
  indexVersion?: number;
  capabilities?: string[];
}

export interface TaskStartParams {
  taskId: string;
  request: string;
  workspaceId: string;
  activeFile?: string;
  selection?: string;
  context: TaskContext;
}

export interface TaskCancelParams {
  taskId: string;
  reason?: string;
}

// ---- Server -> client events ----

export type WorkerPhase = 'PLAN' | 'READ' | 'DRAFT' | 'VERIFY' | 'APPLY' | 'DONE' | 'FAILED';

export interface WorkerStartedEvent {
  taskId: string;
}

export interface WorkerStepEvent {
  taskId: string;
  phase: WorkerPhase;
  summary: string;
}

export interface ContextSelectedEvent {
  taskId: string;
  files: string[];
  symbols: string[];
}

export interface PatchFile {
  path: string;
  unifiedDiff: string;
  expectedHash?: string;
}

export interface PatchGeneratedEvent {
  taskId: string;
  patches: PatchFile[];
}

export interface VerificationEvent {
  taskId: string;
  checks: Array<{ name: string; passed: boolean; output?: string }>;
}

export interface ApprovalRequiredEvent {
  taskId: string;
  patches: PatchFile[];
  commands: Array<{ command: string; args?: string[] }>;
  reason: string;
}

export interface WorkerCompletedEvent {
  taskId: string;
  summary: string;
}

export interface WorkerFailedEvent {
  taskId: string;
  error: string;
}

export type ServerEventMethod =
  | 'worker.started'
  | 'worker.step'
  | 'context.selected'
  | 'patch.generated'
  | 'verification'
  | 'approval.required'
  | 'worker.completed'
  | 'worker.failed';

export interface FileSkeleton {
  filePath: string;
  language: string;
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

export interface SymbolRecord {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
}
