export function DiffPanel(props: { files: string[]; additions: number; deletions: number }): string {
  return `${props.files.length} files (+${props.additions}/-${props.deletions}): ${props.files.join(', ')}`;
}
export default DiffPanel;
