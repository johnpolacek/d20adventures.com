import { createHash } from "node:crypto"

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

export function hashJson(value: unknown): string {
  return hashContent(JSON.stringify(value))
}

