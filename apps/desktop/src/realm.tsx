import { useEffect, useState } from "react"

// The setting's card, snapshotted from the website by scripts/desktop-realm.ts. Explore opens the website's page.
export type Realm = { id: string; name: string; description: string; image: string }

export function useRealm(id = "realm-of-myr") {
  const [realm, setRealm] = useState<Realm | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/stage/realm/${id}/realm.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => live && setRealm(data))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [id])
  return realm
}
