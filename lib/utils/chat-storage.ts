/**
 * Chat localStorage utilities for tracking last seen message timestamps
 */

export function getLastSeenTimestamp(adventureId: string): number {
  if (typeof window === 'undefined') return 0
  const key = `chat-last-seen-${adventureId}`
  return parseInt(localStorage.getItem(key) || '0', 10)
}

export function setLastSeenTimestamp(adventureId: string, timestamp: number): void {
  if (typeof window === 'undefined') return
  const key = `chat-last-seen-${adventureId}`
  localStorage.setItem(key, timestamp.toString())
}

export function updateLastSeenToNow(adventureId: string): void {
  setLastSeenTimestamp(adventureId, Date.now())
}
