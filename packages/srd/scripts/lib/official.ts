import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { lock, root, sha256 } from "./sources"

const raw = readFileSync(resolve(root, lock.official.text), "utf8")
if (sha256(raw) !== lock.official.textSha256) throw new Error("The official text does not match its locked hash")

// The running header is the title and the page number. Left-hand pages print the number first.
const header = /^(?:System Reference Document 5\.2\.1\n(\d+)|(\d+)\nSystem Reference Document 5\.2\.1)\n/

/**
 * The official SRD 5.2.1 text, one string per PDF page. `pages[0]` is page 1. The running header is removed.
 * Lines keep the PDF's breaks, so a word split at a line end reads "cen-\ntered".
 */
export const pages: readonly string[] = raw.split("\f").map((page, index) => {
  const match = header.exec(page)
  // The printed number must be the PDF page, since every entry's `page` relies on the two being the same.
  if (!match || Number(match[1] ?? match[2]) !== index + 1) throw new Error(`Page ${index + 1} does not open with its running header`)
  return page.slice(match[0].length)
})
if (pages.length !== lock.official.pages) throw new Error(`Expected ${lock.official.pages} pages, read ${pages.length}`)

/**
 * Reduce text to lowercase letters and digits. Line breaks, hyphenation, quote styles and spacing all vanish, so
 * the same sentence from the PDF and from a data file compare equal.
 */
export function squash(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

const squashedPages = pages.map(squash)
const starts: number[] = []
let corpus = ""
for (const page of squashedPages) {
  starts.push(corpus.length)
  corpus += page
}

const pageAt = (index: number) => {
  let page = 0
  while (page + 1 < starts.length && starts[page + 1] <= index) page++
  return page + 1
}

/** Whether the official text holds this passage, ignoring layout. Passages may cross a page break. */
export const inOfficial = (text: string): boolean => corpus.includes(squash(text))

/** Every page (1-based) where the passage starts, ignoring layout. */
export function pagesOf(text: string): number[] {
  const needle = squash(text)
  if (!needle) return []
  const found: number[] = []
  for (let index = corpus.indexOf(needle); index !== -1; index = corpus.indexOf(needle, index + 1)) {
    const page = pageAt(index)
    if (found.at(-1) !== page) found.push(page)
  }
  return found
}

/** The first page (1-based) at or after `from` where the passage starts, or null. */
export const pageOf = (text: string, from = 1): number | null => pagesOf(text).find((page) => page >= from) ?? null

/** The text of an inclusive page range, joined, with the PDF's own line breaks. */
export const pageText = (from: number, to = from): string => pages.slice(from - 1, to).join("\n")

/**
 * Sentences of `text` that the official text does not hold. An empty result means the passage is the official
 * wording throughout. Use it to check a description without requiring one unbroken match, since the PDF sets
 * tables and sidebars between paragraphs.
 */
export function missingSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => squash(sentence).length >= 12 && !inOfficial(sentence))
}
