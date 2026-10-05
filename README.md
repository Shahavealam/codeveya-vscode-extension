# AI Code Companion — CodeVeya VS Code Extension

Cursor-like developer client for VS Code. Local-first repository intelligence,
unified-diff editing with approval + rollback, WebSocket + JSON-RPC 2.0 to the
CodeVeya Python Deep Agent backend.

> The extension holds **no LLM business logic**. It builds local context
> (skeletons/symbols/diagnostics/git) and exchanges typed `task.*` / `worker.*`
> messages with the backend.

## Layout

```
codeveya-vscode-extension/src/
  extension.ts            lazy activation, wiring
  commands/               ask / explain / refactor / tests / index / review
  agent/                  AgentProtocol, JsonRpcClient, AgentClient, EventStream, ReconnectManager
  intelligence/           indexer + TreeSitterParser + SkeletonExtractor + SymbolIndex + DependencyGraph + search
  workspace/              FileService, WorkspaceService, GitService, DiagnosticsService
  context/                ContextSnapshot, ContextCache, SecretRedactor
  diff/                   DiffPreview (vscode.diff), PatchApplier (git apply), PatchValidator
  ui/                     ChatPanel, AgentSteps, ContextPanel, DiffPanel, ApprovalDialog (.tsx) + StatusBar + ChatWebviewProvider
  security/               WorkspacePolicy, CommandPolicy
  telemetry/              TelemetryClient (opt-in)
```

## Protocol (backend contract)

Request:

```json
{ "jsonrpc": "2.0", "id": "req_123", "method": "task.start",
  "params": { "taskId": "task_123", "request": "...", "workspaceId": "workspace_123",
              "activeFile": "src/auth/service.ts",
              "context": { "selectedFiles": [], "selectedSymbols": [], "diagnostics": [] } } }
```

Server events: `worker.started, worker.step, context.selected, patch.generated,
verification, approval.required, worker.completed, worker.failed`.
See `src/agent/AgentProtocol.ts` for exact TypeScript schemas.

## Develop

```bash
npm install
npm run compile
npm test
```

Press `F5` in VS Code to launch the Extension Development Host.

## Configure

`codeveyaVSCodeExtension.backendUrl`, `codeveyaVSCodeExtension.websocketUrl`,
`codeveyaVSCodeExtension.authToken` (migrated to SecretStorage),
`codeveyaVSCodeExtension.enableTelemetry`, `codeveyaVSCodeExtension.maxLocalIndexConcurrency`,
`codeveyaVSCodeExtension.autoApproveSafePatches`, `codeveyaVSCodeExtension.requireApprovalForCommands`,
`codeveyaVSCodeExtension.excludePatterns`.

## Safety

- Unified diffs only; validated (`PatchValidator`) before preview.
- Native `vscode.diff` preview, per-file accept/reject, git checkpoint + rollback.
- `SecretRedactor` strips keys/tokens before any transmission; `.env/*.pem/*.key` never indexed.
- Backend-requested commands go through `CommandPolicy` + user approval; arbitrary shell exec is impossible.
