import { createHash, randomBytes, randomInt } from "node:crypto"

// Codes a player reads off the desktop app and types on the website. No 0/O or 1/I.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const LINK_TTL_MS = 10 * 60 * 1000
export const POLL_INTERVAL_S = 3

export const newUserCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")

/** Accepts what a person might type: lower case, spaces, or the dash shown between the halves. */
export const normalizeUserCode = (input: string) => {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return code.length === 8 && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}

export const displayUserCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

export const newSecret = () => randomBytes(32).toString("base64url")

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

export const bearerToken = (header: string | null) => {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/)
  return match ? match[1] : null
}

export const cleanDeviceName = (name: unknown) => {
  const text =
    typeof name === "string"
      ? name
          .replace(/\p{Cc}/gu, "")
          .trim()
          .slice(0, 60)
      : ""
  return text || "Desktop app"
}
