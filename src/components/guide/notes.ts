// Short beginner notes shown on each panel while Guide mode is on.
// Each says what this area is for and what to do here, in plain words.

export const GUIDE_NOTES = {
  agents: {
    title: 'Your agents',
    body: 'An agent is an AI model plus your instructions and the tools it may use. Click one to edit it, press New to start fresh, or try a template to see agents working together.',
  },
  agentSettings: {
    title: 'Build the agent',
    body: 'Choose where the model runs (Provider), which model, and write the System prompt: plain instructions like “You are a friendly maths tutor. Keep answers short.” Changes save automatically.',
  },
  tools: {
    title: 'Give it tools',
    body: 'Models are bad at exact maths, dates and looking things up. Tick a tool and the model can ask KantoLab to run it, e.g. the calculator for “17 × 23”. Only tick what the agent needs.',
  },
  documents: {
    title: 'Let it read your files',
    body: 'Add text documents here, then enable the search_documents tool. The agent can then look up answers in your files. Everything stays in this browser.',
  },
  trace: {
    title: 'How to read the trace',
    body: 'Each card is one step, top to bottom: the instructions, your question, every tool the model used, and the final answer. With Guide on, each card explains itself. Click “data” for the raw JSON.',
  },
  compare: {
    title: 'Compare two agents',
    body: 'Ask two agents the same question and see their answers, speed and tool use side by side. Handy for “is the bigger model worth it?” or “did my new prompt help?”.',
  },
  tests: {
    title: 'Test your agent',
    body: 'Write questions with the answer you expect, then run them all at once to get a pass rate. Change something, run again, and the history shows whether it got better and what you changed.',
  },
  history: {
    title: 'Past runs',
    body: 'Every run is saved in this browser. Open one to read its trace again, export it, or edit a step and re-run. The samples show finished runs without needing a model.',
  },
} as const

export type GuideNoteId = keyof typeof GUIDE_NOTES
