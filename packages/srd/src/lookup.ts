/** Index entries by id. */
export function byId<T extends { id: string }>(entries: readonly T[]): ReadonlyMap<string, T> {
  return new Map(entries.map((entry) => [entry.id, entry]))
}
