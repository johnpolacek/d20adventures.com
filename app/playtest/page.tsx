import { auth } from "@clerk/nextjs/server"
import { Github } from "lucide-react"
import Link from "next/link"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { CopyBlock } from "./copy-block"

export const dynamic = "force-dynamic"
export const metadata = { title: "Become a Playtester | D20 Adventures" }

const repo = "https://github.com/johnpolacek/d20adventures.com"
const soloDemo = "/settings/realm-of-myr/the-midnight-summons"
const installSource = `${repo}/blob/main/public/install.sh`
const setupPrompt = `Set me up as a D20 Adventures playtester on this computer.

1. Check that Node.js 24 or newer is installed. If not, tell me how to install it and stop.
2. Read the install script for this system before running it:
   Mac or Linux: https://d20adventures.com/install.sh
   Windows: https://d20adventures.com/install.ps1
3. Run it:
   Mac or Linux: curl -fsSL https://d20adventures.com/install.sh | sh
   Windows, in PowerShell: irm https://d20adventures.com/install.ps1 | iex
4. Open D20 Adventures. It shows a code to link it to my account: help me approve it at https://d20adventures.com/desktop/link, and sign up there first if I have no account.
5. Help me start The Midnight Summons.
6. Show me how to invite a friend to my game, and how to send feedback when something breaks.
7. Tell me what you did and anything that failed.

Source: ${repo}`

const hairline = "h-px w-full bg-gradient-to-r from-amber-200/0 via-amber-200/45 to-amber-200/0"

export default async function PlaytestPage() {
  const { userId } = await auth()
  const joined = !!userId

  return (
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-black">
        <Image fill priority src="/stage/realm/realm-of-myr/realm.jpg" alt="" className="object-cover" />
      </div>
      <div className="container pt-28 pb-24">
        <article className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-amber-200/20 bg-black/90 shadow-[0_18px_44px_#000a]">
          <header className="px-6 pt-10 sm:px-10 lg:px-14 lg:pt-14">
            <h1 className="bg-[linear-gradient(180deg,#fff7d6_0%,#fcd34d_38%,#b7791f_55%,#fde68a_72%,#a16207_100%)] bg-clip-text font-display text-4xl leading-tight text-transparent drop-shadow-[0_2px_6px_#f59e0b55] sm:text-5xl">{joined ? "You’re a Playtester" : "Become a Playtester"}</h1>
            <p className="mt-4 font-serif text-lg leading-relaxed text-white/80">
              Run a tabletop adventure with an AI Game Master. Host it on your computer, and your friends join from the web. D20 Adventures is in alpha, so expect rough edges.
            </p>
          </header>

          <div className="space-y-8 px-6 pt-8 pb-10 sm:px-10 lg:px-14">
            <section>
              <h2 className="font-display text-xl text-indigo-300">Host a Game</h2>
              <CopyBlock label="Prompt" text={setupPrompt} className="mt-4" />
            </section>

            <div className="flex items-center gap-4">
              <div className={hairline} />
              <span className="shrink-0 font-display text-sm tracking-[0.2em] uppercase text-amber-200/70">or</span>
              <div className={hairline} />
            </div>

            <div className="text-center">
              <Button variant="epic" render={<Link href={soloDemo} />}>
                Play the Solo Demo
              </Button>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-amber-200/15 px-6 py-4 font-sans text-sm tracking-wide">
            <a href={repo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/75 transition-[color,opacity] duration-150 hover:text-amber-200 active:opacity-70">
              <Github className="size-4" />
              View on GitHub
            </a>
            <a href={installSource} target="_blank" rel="noopener noreferrer" className="text-white/75 underline decoration-amber-200/40 underline-offset-4 transition-[color,opacity] duration-150 hover:text-amber-200 active:opacity-70">
              View the Install Script
            </a>
          </footer>
        </article>
      </div>
    </div>
  )
}
