// The prompt a new host pastes into an AI coding agent. It is kept short: the steps live in the guide it names
// (public/host.md), which the agent reads and follows. The playtest page gives it with no adventure named, and each
// adventure's page for its own adventure.

export const REPO = "https://github.com/johnpolacek/d20adventures.com"
export const HOST_GUIDE = "https://d20adventures.com/host.md"

export function hostPrompt(adventure?: string) {
  return `Help me host ${adventure ?? "a game"} in D20 Adventures on this computer, with friends joining from the web.

Follow ${HOST_GUIDE}. Fetch the raw file so you read all of it.`
}
