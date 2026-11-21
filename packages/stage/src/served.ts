// Where the stage's files are fetched from. A file is named by its path ("/stage/sets/…"), and by default the page's
// own address serves it: the desktop app from its bundle, the dev site from public/, the live site by relaying the
// public bucket. `serveFrom` names a host that holds the same paths, so a visitor's browser fetches from it directly
// and the relay carries nothing. The host must allow cross-origin reads, because the stage reads pictures as textures
// and fetches models and sounds.

// The stage's own folders, and the app's background textures, which sit in the same bucket.
const ROOTS = /^\/(stage|stage-lab|asset-library|hero-art|images\/app\/backgrounds)\//
let host = ""

export function serveFrom(address: string) {
  host = address.replace(/\/+$/, "")
}

/** A file's address: on the host named, or as given when none is, or when the file is not one of the stage's. */
export const served = (url: string) => (host && ROOTS.test(url) ? `${host}${url}` : url)
