import * as vscode from 'vscode';

/**
 * Sidebar chat provider. Uses a dependency-free HTML webview (no bundler needed).
 * Rich Next.js UI can replace `getHtml()` later; the postMessage contract stays stable.
 */
export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'codeveya-chat';
  private view: vscode.WebviewView | null = null;

  constructor(private readonly output: vscode.OutputChannel) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();
    view.webview.onDidReceiveMessage((msg: { type: string; text?: string }) => {
      if (msg.type === 'ask') {
        void vscode.commands.executeCommand('codeveya.ask');
      }
      this.output.appendLine(`[webview] ${JSON.stringify(msg).slice(0, 300)}`);
    });
  }

  postEvent(type: string, data: unknown): void {
    void this.view?.webview.postMessage({ type, data });
  }

  private getHtml(): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>body{font-family:var(--vscode-font-family);padding:12px}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:8px 12px;cursor:pointer}#log{margin-top:12px;white-space:pre-wrap;font-size:12px}.phase{font-weight:700;color:var(--vscode-textLink-foreground)}</style>
</head><body>
<h3>CodeVeya</h3>
<button id="ask">Ask AI</button>
<div id="status" class="phase">idle</div>
<div id="ctx"></div>
<div id="log"></div>
<script>
const vscode = acquireVsCodeApi();
document.getElementById('ask').onclick = () => vscode.postMessage({type:'ask'});
window.addEventListener('message', (e) => {
  const { type, data } = e.data || {};
  if (type === 'worker.status') document.getElementById('status').textContent = data.phase + ': ' + (data.summary||'');
  else if (type === 'context.used') document.getElementById('ctx').textContent = '~' + data.tokens + ' tokens · ' + data.files + ' files';
  else if (type === 'diff.ready') { const el = document.getElementById('log'); el.textContent += '\\nDIFF ' + data.files.join(', ') + ' (+' + data.additions + '/-' + data.deletions + ')\\n'; }
});
</script></body></html>`;
  }
}
