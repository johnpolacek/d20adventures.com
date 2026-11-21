// Whether the web game reads its story aloud. It does not: the desktop app narrates with Kokoro on the player's own
// machine (packages/ui/src/sound/narrator.ts), and the web demo has no audio. The site's own narration, which paid a
// speech model per turn, stays in the code behind this switch: lib/services/turn-audio-service.ts makes none while it
// is off, and the game shows no Storyview controls.
export const WEB_NARRATION = false
