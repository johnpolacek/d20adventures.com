// Adventures for sale. Prices go to Stripe as inline price_data, so this list is the only price source.
export type CatalogEntry = {
  id: string
  settingId: string
  priceCents: number
  free: boolean
}

// Owner defaults pending confirmation (wiki/plans/feature-adventure-store.md): one free starter, the rest $5.
export const CATALOG: CatalogEntry[] = [
  { id: "the-midnight-summons", settingId: "realm-of-myr", priceCents: 0, free: true },
  { id: "march-of-davos", settingId: "realm-of-myr", priceCents: 500, free: false },
  { id: "covert-cargo", settingId: "realm-of-myr", priceCents: 500, free: false },
  { id: "the-road-to-kordavos", settingId: "realm-of-myr", priceCents: 500, free: false },
]

export const catalogEntry = (id: string) => CATALOG.find((entry) => entry.id === id)

export type LibraryEntry = CatalogEntry & { owned: boolean }

/** Free adventures count as owned. Owned ids not in the catalog are ignored. */
export const libraryOf = (ownedIds: Iterable<string>, catalog: CatalogEntry[] = CATALOG): LibraryEntry[] => {
  const owned = new Set(ownedIds)
  return catalog.map((entry) => ({ ...entry, owned: entry.free || owned.has(entry.id) }))
}
