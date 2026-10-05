export interface ChatMessageProps { role: 'user' | 'assistant' | 'system'; text: string }
export function ChatPanel(props: { messages: ChatMessageProps[] }): string {
  return props.messages.map((m) => `[${m.role}] ${m.text}`).join('\n');
}
export default ChatPanel;
