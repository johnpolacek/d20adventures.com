// For the browser: whether the site's own GM has stopped for the day, and what to tell the player.

export const DEMO_LIMIT_MESSAGE = "The demo has reached its limit for today. Come back tomorrow, or host a game in the desktop app."

/** True once today's AI budget is spent. A failure to find out reads as not spent. */
export async function demoLimitReached(): Promise<boolean> {
  try {
    const response = await fetch("/api/demo-status", { cache: "no-store" })
    return response.ok && (await response.json()).open === false
  } catch {
    return false
  }
}
