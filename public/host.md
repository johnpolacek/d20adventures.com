# Host a D20 Adventures Game

This guide is for an AI coding agent helping someone host a game. The host runs the game in the desktop app on their own computer, and friends join in a browser. You do the terminal work. The person does the clicking, so give them one step at a time and wait for them to say what they see.

## 1. Agree on the game

Ask how many friends will play and which adventure, unless they said. Seats count every hero: the host's, each friend's, and any the AI plays.

- The Midnight Summons: 1 hero. One friend plays and the host watches.
- The Road to Kordavos: 1 to 3 heroes.
- Covert Cargo: 3 heroes.
- Welcome to Kordavos: 3 to 5 heroes.

Tell the host two things now: every player's turn runs on the host's own AI CLI and its plan, and the app must stay open, with the computer awake, while friends play.

## 2. Check the computer

Check these before installing. Say what is missing, help fix it, and install nothing until all pass.

- **System.** There are builds for macOS on Apple Silicon and Intel, Linux on x86_64, and Windows on x64.
- **Node.js 24 or newer, where the app looks.** On a Mac the app does not read the shell's PATH. It runs the first `node` found in these folders, in order: `~/.local/share/fnm/aliases/default/bin`, `~/.volta/bin`, `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`. On Windows: `%ProgramFiles%\nodejs`, then PATH. Run that first `node` with `--version`. A Node from nvm, asdf or mise is not found, so link it and check again: `mkdir -p ~/.local/bin && ln -sf "$(node -p process.execPath)" ~/.local/bin/node`.
- **An AI CLI, signed in.** It runs the Game Master: Claude Code (`claude`), Codex (`codex`), Grok (`grok`) or Antigravity (`agy`). The app takes the first one found in `~/.local/bin`, the fnm and Volta folders above, `~/.bun/bin`, `~/.grok/bin`, `/opt/homebrew/bin` and `/usr/local/bin`, and on Windows `%APPDATA%\npm`. Run the copy at that path with one real request, such as `claude -p hi` or `codex exec hi`. The app lists a signed-out CLI as ready, then fails on the first turn.
- **Not an npm build, on a Mac.** If that file starts with `#!/usr/bin/env node`, app version 0.1.2 cannot start it. Install the CLI's standalone build instead, so a binary sits in one of those folders.
- **Linux only.** The AppImage needs FUSE 2 (`libfuse2` on Ubuntu) and a desktop session.

## 3. Install the app

Read the script, then run it. It downloads the latest release, installs it and opens it.

- Mac or Linux: read https://d20adventures.com/install.sh, then `curl -fsSL https://d20adventures.com/install.sh | sh`
- Windows, in PowerShell: read https://d20adventures.com/install.ps1, then `irm https://d20adventures.com/install.ps1 | iex`

Running it again updates an installed app. It quits the app first, which stops a game being hosted, so ask before updating. If you are not allowed to open apps, ask the person to open D20 Adventures.

## 4. Link the account

A new install opens on **Link your account**, and nothing plays until it is done. An app that is already linked skips this.

1. The person clicks **Link account**. Their browser opens https://d20adventures.com/desktop/link with a code filled in, and the app shows the same code.
2. On the website they sign in, or sign up free, then click **Link**.
3. The app moves on to its title screen.

## 5. Start the game

1. Click **Begin**, then **Play** on the adventure.
2. On the party screen each hero has **Who plays**: You, AI or Invite. Set a hero to **Invite** for each friend. The host leaves one on You to play too.
3. Adventures with several heroes offer three shortcuts. Premades lets friends choose among the heroes. Bring Their Own has each friend make a hero. Open Invite allows either.
4. Under **Game Master**, pick the CLI checked in step 2. It goes back to Claude each time the app opens.
5. Click **Invite**. It replaces Play once any hero is set to Invite.

## 6. Invite friends

1. The **Hosting** screen lists an invite link for each open seat, with a **Copy** button. The host sends one to each friend.
2. A friend opens the link, signs in or signs up free, picks a hero and clicks **Join**. If the button says **Ask to Join**, the host approves them under **Asking to join**.
3. Friends appear under **At the table**. The host clicks **Start**.

If the host closes the app, friends see “The host’s app is offline” and their actions wait until it returns.

## If something goes wrong

- “Install Node.js 24 or newer to run the local GM” or “The local GM stopped”: the app found no Node, or an old one. Redo the Node check.
- “Install and sign in to Claude Code, Codex, Grok, or Antigravity”: no CLI is in the folders the app searches, so Play and Invite stay disabled. Redo the CLI check, then quit and reopen the app.
- “could not finish this request. Check its sign-in or usage limit”: the CLI is signed out, out of usage, or an npm build. Redo the CLI check, or pick another under Game Master.
- Linking fails on Linux: the app saves the link in the system keyring, so one must be running.
- To see what is running: `pgrep -fl "D20 Adventures"` for the app, and `pgrep -fl host.cjs` for a hosted game.
- To report a problem, use **Give Us Feedback** in the top bar during play, or https://d20adventures.com/contact.
- The app's code is in `apps/desktop` at https://github.com/johnpolacek/d20adventures.com.

When the game is running, tell the person what you did and anything that failed.
