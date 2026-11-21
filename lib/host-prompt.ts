// The prompt a new host pastes into an AI coding agent: it installs the desktop app, links it to their account and
// starts an adventure. The playtest page gives it for the demo, and each adventure's page for its own adventure.

export const REPO = "https://github.com/johnpolacek/d20adventures.com"

export function hostPrompt(adventure = "The Midnight Summons") {
  return `Set me up as a D20 Adventures playtester on this computer.

1. Check that Node.js 24 or newer is installed. If not, tell me how to install it and stop.
2. Read the install script for this system before running it:
   Mac or Linux: https://d20adventures.com/install.sh
   Windows: https://d20adventures.com/install.ps1
3. Run it:
   Mac or Linux: curl -fsSL https://d20adventures.com/install.sh | sh
   Windows, in PowerShell: irm https://d20adventures.com/install.ps1 | iex
4. Open D20 Adventures. It shows a code to link it to my account: help me approve it at https://d20adventures.com/desktop/link, and sign up there first if I have no account.
5. Help me start ${adventure}.
6. Show me how to invite a friend to my game, and how to send feedback when something breaks.
7. Tell me what you did and anything that failed.

Source: ${REPO}`
}
