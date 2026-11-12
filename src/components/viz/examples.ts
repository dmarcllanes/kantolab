// Starter prompts, chosen to exercise whichever tools the agent has enabled.
const BY_TOOL: Record<string, string> = {
  calculator: 'Dinner was ₱2,350 with a 12% tip, split 4 ways. How much each?',
  current_time: 'What day and time is it in Tokyo right now?',
  search_documents: 'What do my documents say about refunds?',
  fetch_url: 'What is the title of https://example.com?',
}

export function examplePrompts(toolNames: string[]): string[] {
  const picks = toolNames.map((n) => BY_TOOL[n]).filter((p): p is string => !!p)
  if (picks.length === 0) return ['Explain what an AI agent is in two sentences.', 'Write a haiku about Manila traffic.']
  return picks.slice(0, 3)
}
