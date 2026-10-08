// Adventures for sale. Prices go to Stripe as inline price_data, so this list is the only price source.
export type CatalogEntry = {
  id: string
  settingId: string
  priceCents: number
  free: boolean
  // A free adventure's usual price, shown crossed out beside FREE.
  listPriceCents?: number
}

// Alpha, owner 2026-10-08: every adventure is free. March of Davos shows its $5 price crossed out.
// The order is the New game screen's tab order.
export const CATALOG: CatalogEntry[] = [
  { id: "march-of-davos", settingId: "realm-of-myr", priceCents: 0, free: true, listPriceCents: 500 },
  { id: "the-midnight-summons", settingId: "realm-of-myr", priceCents: 0, free: true },
  { id: "covert-cargo", settingId: "realm-of-myr", priceCents: 0, free: true },
  { id: "the-road-to-kordavos", settingId: "realm-of-myr", priceCents: 0, free: true },
]

export const catalogEntry = (id: string) => CATALOG.find((entry) => entry.id === id)

export type LibraryEntry = CatalogEntry & { owned: boolean }

/** Free adventures count as owned. Owned ids not in the catalog are ignored. */
export const libraryOf = (ownedIds: Iterable<string>, catalog: CatalogEntry[] = CATALOG): LibraryEntry[] => {
  const owned = new Set(ownedIds)
  return catalog.map((entry) => ({ ...entry, owned: entry.free || owned.has(entry.id) }))
}
