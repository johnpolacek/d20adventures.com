import { createInterface } from "node:readline"
import { hostCommand, hostCommandSchema } from "./host-commands"
import { LocalStore } from "./store"

// The app's link to the website for hosted games: kept running while the app is open, so a poll of a hosted game
// does not start Node each time. Each line in is a host command with the device token Rust added, and each line out
// answers it, in turn. Rust stops it by closing stdin. It reads the save only for the hero roster, as runtime.cjs did.
console.log = console.warn = console.error = () => {}
const savePath = process.argv[2]
const site = (process.env.D20_SITE_URL ?? "https://d20adventures.com").replace(/\/$/, "")
const reply = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)
const parentWatch = setInterval(() => process.ppid === 1 && process.exit(0), 2000)

async function main() {
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      const parsed = hostCommandSchema.safeParse(JSON.parse(line))
      if (!parsed.success) {
        reply({ error: "Unknown host action." })
        continue
      }
      const command = parsed.data
      let roster: LocalStore | undefined
      try {
        reply(await hostCommand(command, site, () => (roster ??= new LocalStore(savePath)).heroes()))
      } finally {
        roster?.db.close()
      }
    } catch (error) {
      reply({ error: error instanceof Error ? error.message : "The website link could not do that." })
    }
  }
  clearInterval(parentWatch)
}

void main()
