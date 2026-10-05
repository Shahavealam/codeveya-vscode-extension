export function ApprovalDialog(props: { reason?: string; files: string[] }): string {
  return `Apply ${props.files.length} file(s)?${props.reason ? ` Reason: ${props.reason}` : ''}\n${props.files.join('\n')}`;
}
export default ApprovalDialog;
