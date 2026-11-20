// The player's sound setting, kept in the browser so the site and the app read it the same way. On unless turned off.

const KEY = "d20.sound"
const listeners = new Set<(on: boolean) => void>()

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off"
  } catch {
    return true
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off")
  } catch {}
  for (const l of listeners) l(on)
}
export function onSoundSetting(listener: (on: boolean) => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
