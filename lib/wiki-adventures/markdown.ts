import type { ParsedMarkdownFile, RuntimeLink, SourceFile } from "./types"

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/
const WIKI_LINK_RE = /\[\[([a-zA-Z]+):([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\]\]/g

export function parseMarkdownFile(file: SourceFile): ParsedMarkdownFile {
  const match = file.content.match(FRONTMATTER_RE)
  if (!match) {
    return {
      ...file,
      frontmatter: {},
      body: file.content,
      sections: extractMarkdownSections(file.content),
      typedLinks: extractTypedLinks(file.content),
    }
  }

  const frontmatterText = match[1]
  const body = file.content.slice(match[0].length)
  return {
    ...file,
    frontmatter: parseSimpleYaml(frontmatterText),
    body,
    sections: extractMarkdownSections(body),
    typedLinks: extractTypedLinks(body),
  }
}

export function extractTypedLinks(markdown: string): RuntimeLink[] {
  const links: RuntimeLink[] = []
  for (const match of markdown.matchAll(WIKI_LINK_RE)) {
    links.push({
      type: match[1],
      id: match[2],
      label: match[3],
    })
  }
  return links
}

export function extractMarkdownSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = markdown.split(/\r?\n/)
  let current = "body"
  let buffer: string[] = []

  const flush = () => {
    const text = buffer.join("\n").trim()
    if (text) sections[current] = text
    buffer = []
  }

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      flush()
      current = normalizeSectionName(heading[1])
      continue
    }
    buffer.push(line)
  }
  flush()
  return sections
}

function normalizeSectionName(value: string): string {
  const [first, ...rest] = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (!first) return "body"
  return `${first.toLowerCase()}${rest.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`).join("")}`
}

function parseSimpleYaml(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  const lines = input.split(/\r?\n/)
  let currentArrayKey: string | null = null
  let currentObjectKey: string | null = null

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue
    const arrayItem = rawLine.match(/^\s*-\s+(.+)$/)
    if (arrayItem && currentArrayKey) {
      const existing = root[currentArrayKey]
      if (Array.isArray(existing)) existing.push(parseScalar(arrayItem[1]))
      continue
    }

    const nested = rawLine.match(/^\s{2,}([a-zA-Z0-9_-]+):\s*(.*)$/)
    if (nested && currentObjectKey) {
      const objectValue = root[currentObjectKey]
      if (objectValue && typeof objectValue === "object" && !Array.isArray(objectValue)) {
        ;(objectValue as Record<string, unknown>)[nested[1]] = parseScalar(nested[2])
      }
      continue
    }

    const keyValue = rawLine.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/)
    if (!keyValue) continue
    const [, key, value] = keyValue
    currentArrayKey = null
    currentObjectKey = null
    if (value === "") {
      const nextNonEmpty = lines.slice(lines.indexOf(rawLine) + 1).find((line) => line.trim())
      if (nextNonEmpty?.trim().startsWith("- ")) {
        root[key] = []
        currentArrayKey = key
      } else {
        root[key] = {}
        currentObjectKey = key
      }
    } else {
      root[key] = parseScalar(value)
    }
  }
  return root
}

function parseScalar(raw: string): unknown {
  const value = raw.trim()
  if (value === "true") return true
  if (value === "false") return false
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((entry) => parseScalar(entry))
  }
  return value.replace(/^["']|["']$/g, "")
}

