# FILE 1 — VS CODE EXTENSION APPLICATION SPECIFICATION

## Role

You are GitHub Copilot/Copilot Coding Agent acting as a Principal VS Code Extension Architect.

Build a production-grade, market-competitive Cursor-like VS Code extension named `codeveya-vscode-extension`.

The extension is the developer-facing client. It must NOT contain the main LLM/agent business logic. It communicates with the Python Deep Agent backend through WebSocket + JSON-RPC.

Primary goals:
- Extremely low latency
- Minimal token usage
- Local-first repository intelligence
- Safe multi-file code changes
- Unified-diff based editing
- Excellent developer UX
- Incremental indexing
- Secure workspace access
- Git-aware approvals and rollback

## Required technology

- TypeScript
- VS Code Extension API
- NextJS+ TypeScript for custom UI only where necessary
- WebSocket
- JSON-RPC 2.0 style protocol
- Tree-sitter for syntax/skeleton extraction
- ripgrep for fast lexical search where available
- TypeScript compiler/VS Code diagnostics
- Git CLI / VS Code Git APIs
- MongoDB is the application's backend persistence/search database; the extension itself must not connect directly to MongoDB.
- Backend URL and authentication must be configurable.
- Use strict TypeScript.
- ESLint + Prettier.
- Vitest/Jest for unit tests.
- VS Code extension integration tests.

Use VS Code native APIs whenever possible. Use Webviews only where a rich custom UI is actually required. Keep activation lazy and avoid blocking the extension host.

## Architecture

Create:

codeveya-vscode-extension/
  src/
    extension.ts
    commands/
      askAgent.ts
      explainCode.ts
      refactor.ts
      generateTests.ts
      indexWorkspace.ts
    agent/
      AgentClient.ts
      JsonRpcClient.ts
      EventStream.ts
      AgentProtocol.ts
      ReconnectManager.ts
    intelligence/
      indexer/
        WorkspaceIndexer.ts
        FileWatcher.ts
        IndexScheduler.ts
      parser/
        TreeSitterParser.ts
        SkeletonExtractor.ts
      symbols/
        SymbolIndex.ts
      dependencies/
        DependencyGraph.ts
      search/
        LocalCodeSearch.ts
        RipgrepSearch.ts
    workspace/
      FileService.ts
      WorkspaceService.ts
      GitService.ts
      DiagnosticsService.ts
    context/
      ContextSnapshot.ts
      ContextCache.ts
      SecretRedactor.ts
    diff/
      DiffPreview.ts
      PatchApplier.ts
      PatchValidator.ts
    ui/
      ChatPanel.tsx
      AgentSteps.tsx
      ContextPanel.tsx
      DiffPanel.tsx
      ApprovalDialog.tsx
      StatusBar.ts
    security/
      WorkspacePolicy.ts
      CommandPolicy.ts
    telemetry/
      TelemetryClient.ts
  package.json
  tsconfig.json
  eslint.config.js
  README.md

## Core UX

Provide:
1. Command Palette commands:
   - AI Code Companion: Ask
   - AI Code Companion: Explain Selection
   - AI Code Companion: Refactor
   - AI Code Companion: Generate Tests
   - AI Code Companion: Index Workspace
   - AI Code Companion: Review Changes

2. Sidebar:
   - Chat
   - Agent worker status
   - Context used
   - Token estimate
   - Changed files
   - Verification status

3. Agent worker UI:

PLAN
  Identify task and candidate areas

READ
  Search repository
  Select symbols/files
  Retrieve context

DRAFT
  Generate patches

VERIFY
  TypeScript
  ESLint
  Tests

APPLY
  Await approval if required
  Apply changes

Do not display hidden chain-of-thought. Display concise action/status summaries only.

## Local-first intelligence

The extension should maintain an incremental local repository index.

On workspace open:
- discover repository
- detect supported languages
- load ignore rules
- scan files asynchronously
- parse supported files with Tree-sitter
- extract skeletons
- extract symbols
- extract imports/exports
- build dependency relationships
- persist lightweight local metadata

Do NOT send the complete repository to the backend.

When a file changes:
- update only that file
- reparse it
- update affected symbol records
- update dependency relationships
- invalidate only impacted cache entries

Ignore:
- node_modules
- .git
- dist
- build
- coverage
- .next
- target
- vendor
- binaries
- secrets
- .env*
- *.pem
- *.key
- credentials files

Support `.aiignore`.

## Skeleton extraction

For each source file, create a compact skeleton containing:
- file path
- language
- imports
- exports
- classes
- interfaces
- types
- enums
- functions
- methods
- signatures
- decorators
- public fields
- docstrings/comments where useful

Do not include implementation bodies in skeleton context.

Example:

FILE: src/auth/AuthService.ts

IMPORTS:
  UserRepository
  TokenService

CLASS:
  AuthService

METHODS:
  login(email: string, password: string): Promise<AuthResult>
  refresh(token: string): Promise<TokenPair>
  logout(userId: string): Promise<void>

DEPENDENCIES:
  UserRepository
  TokenService

## Context snapshot sent to backend

For every agent task, send only:
- task ID
- user request
- active file
- selected code/selection
- workspace metadata
- git status/diff summary
- relevant skeletons
- relevant symbols
- relevant diagnostics
- user-selected files
- repository/index version
- tool capabilities

Never automatically send all source files.

## JSON-RPC / WebSocket protocol

Implement request IDs, correlation IDs, reconnect, timeout, cancellation and backpressure.

Example:

{
  "jsonrpc": "2.0",
  "id": "req_123",
  "method": "task.start",
  "params": {
    "taskId": "task_123",
    "request": "Add refresh token authentication",
    "workspaceId": "workspace_123",
    "activeFile": "src/auth/service.ts",
    "context": {
      "selectedFiles": [],
      "selectedSymbols": [],
      "diagnostics": []
    }
  }
}

Server events:

worker.started
worker.step
context.selected
patch.generated
verification
approval.required
worker.completed
worker.failed

Implement typed event schemas.

## Diff and patch UX

Never blindly overwrite complete files.

Backend returns unified diffs.

Before applying:
- validate path
- verify expected file version/hash
- show VS Code diff
- show additions/deletions
- allow accept/reject per file
- allow reject entire task
- detect workspace changed since patch generation

Apply atomically.

Create a Git checkpoint before risky multi-file changes.

Support rollback.

## Security

Never expose:
- API keys
- .env secrets
- private keys
- credentials
- tokens

Add a SecretRedactor before context transmission.

All backend commands must be policy controlled.

The extension must never execute arbitrary shell commands because an LLM requested them.

For command execution:
LLM -> backend tool request -> policy -> optional user approval -> extension execution -> result.

## Performance requirements

- Extension activation must be lazy.
- Never perform a full repository parse on the UI thread.
- Debounce file watchers.
- Batch incremental indexing.
- Cache skeletons.
- Cache symbol metadata.
- Cache context snapshots.
- Avoid repeated file reads.
- Avoid sending unchanged context.
- Compress large diagnostics before transmission.
- Cancel stale agent requests.
- Limit concurrent indexing jobs.
- Do not keep full repository content in memory.

Target:
- command UI response <100 ms for local operations where practical
- local search should feel instantaneous
- no unnecessary backend round trip for local operations
- indexing should be incremental after initial scan

## Git integration

Before applying agent-generated multi-file changes:
- capture git status
- capture HEAD
- capture changed-file hashes
- optionally create checkpoint/branch

After apply:
- show git diff
- allow rollback

Never discard pre-existing user modifications.

## Configuration

Expose:

aiCodeCompanion.backendUrl
aiCodeCompanion.websocketUrl
aiCodeCompanion.authToken
aiCodeCompanion.enableTelemetry
aiCodeCompanion.maxLocalIndexConcurrency
aiCodeCompanion.autoApproveSafePatches
aiCodeCompanion.requireApprovalForCommands
aiCodeCompanion.excludePatterns

Never store secrets in plain text unnecessarily. Prefer VS Code SecretStorage.

## Testing

Create tests for:
- skeleton extraction
- symbol indexing
- dependency indexing
- ignore rules
- secret redaction
- JSON-RPC messages
- reconnect
- cancellation
- patch validation
- workspace hash conflicts
- diff preview
- approval flow
- rollback
- file watcher
- context snapshot generation

Add integration tests for:
Ask -> backend -> events -> diff -> approval -> apply.

## Deliverable

Generate the complete VS Code extension application, not pseudocode.

Do not invent missing backend APIs. Define shared protocol types clearly so the Deep Agent service can implement them.

Keep the implementation modular and production-ready.
