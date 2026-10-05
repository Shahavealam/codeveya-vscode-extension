export interface Step { phase: 'PLAN'|'READ'|'DRAFT'|'VERIFY'|'APPLY'|'DONE'|'FAILED'; summary: string }
export function AgentSteps(props: { steps: Step[] }): string {
  const order = ['PLAN','READ','DRAFT','VERIFY','APPLY'];
  return order.map((p) => {
    const s = props.steps.find((x) => x.phase === p);
    return `${s ? '●' : '○'} ${p}${s ? ` — ${s.summary}` : ''}`;
  }).join('\n');
}
export default AgentSteps;
