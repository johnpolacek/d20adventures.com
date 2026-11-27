import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import ts from "typescript"

// Game logic does not read what a player or the model meant with a pattern on their words (AGENTS.md). Each file of
// the GM's services and story may hold only the patterns listed here, each with why. A new one fails this check: put
// the meaning in a field the model's schema or the content sets, and read that. A pattern on text we write (ids, dice,
// our markdown, a split into paragraphs) may be added here with its reason. "debt" marks one that reads a player's or
// the model's words and should go.
const ALLOWED: Record<string, { count: number; why: string }> = {
  "services/adventure-first-turn-service.ts": { count: 1, why: "splits the story text into paragraphs" },
  "services/adventure-roll-result-service.ts": { count: 6, why: "paragraph split; debt: five find the model's empty-output filler" },
  "services/narrative-generation-service.ts": { count: 1, why: "splits the story text into paragraphs" },
  "services/npc-turn-generation-service.ts": { count: 1, why: "splits the story text into paragraphs" },
  "services/roll-requirement-service.ts": { count: 4, why: "menu punctuation, a choice id; the target fallback when the model leaves it out" },
  "story/authored.ts": { count: 13, why: "parses the adventure markdown's paragraph labels" },
  "story/clean.ts": { count: 19, why: "quote marks and spacing in beats; debt: soleNamed gives quoted words to a name in the narration" },
  "story/knowledge.ts": { count: 7, why: "fact ids the game writes, and slugs" },
  "story/names.ts": { count: 3, why: "debt: a hero's name heard in a spoken line, which wants a `names` field on line beats" },
  "story/prompt.ts": { count: 5, why: "pronouns and short names from authored fields" },
  "story/render.ts": { count: 1, why: "titles an id" },
  "story/turn.ts": { count: 1, why: "debt: a line ending in a question mark, which wants an `asks` field on line beats" },
  "utils/narrative-utils.ts": { count: 12, why: "markdown and punctuation cleanup; drops the GM's closing question to the players" },
}

const root = "packages/gm-core/src/"
const files = execSync(`git ls-files --cached --others --exclude-standard '${root}services/*.ts' '${root}story/*.ts' '${root}orchestration/*.ts' '${root}utils/*.ts'`)
  .toString()
  .trim()
  .split("\n")
  .filter((file) => file && !file.endsWith(".test.ts"))

const patterns = (file: string): number => {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  let count = 0
  const walk = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) count++
    else if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp") count++
    ts.forEachChild(node, walk)
  }
  walk(source)
  return count
}

const faults: string[] = []
const fewer: string[] = []
for (const file of files) {
  const key = file.slice(root.length)
  const count = patterns(file)
  const allowed = ALLOWED[key]?.count ?? 0
  if (count > allowed) faults.push(`${file}: ${count} patterns, ${allowed} allowed`)
  else if (count < allowed) fewer.push(`${key}: ${count} now, ${allowed} allowed`)
}
if (fewer.length) console.log(`regex-check: fewer patterns than allowed. Lower these in scripts/regex-check.ts:\n  ${fewer.join("\n  ")}`)
if (faults.length) {
  console.error(
    `regex-check: new patterns in GM code.\n  ${faults.join("\n  ")}\nGame logic does not read what a player or the model meant with a pattern. Add a field to the model's schema or the content, and read that. A pattern on text we write goes in scripts/regex-check.ts with its reason.`
  )
  process.exit(1)
}
console.log("regex-check: ok")
