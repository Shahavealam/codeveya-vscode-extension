export function ContextPanel(props: { tokens: number; files: number; symbols?: number }): string {
  return `context ~${props.tokens} tokens · ${props.files} files${props.symbols ? ` · ${props.symbols} symbols` : ''}`;
}
export default ContextPanel;
