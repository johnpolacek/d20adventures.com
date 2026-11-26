// Whether the web game runs Storyview, the site's old narration, which paid a speech model per turn. It does not: the web
// game reads aloud with Kokoro on the player's own graphics card (components/adventure/turn-sound.tsx), as the desktop
// app does on its processor. Storyview stays in the code behind this switch: lib/services/turn-audio-service.ts makes
// no audio while it is off, and the game shows no Storyview controls.
export const WEB_NARRATION = false
