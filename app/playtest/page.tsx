import { auth } from "@clerk/nextjs/server"
import { Castle, Feather, Github, type LucideIcon, ScrollText } from "lucide-react"
import Link from "next/link"
import Image from "@d20/ui/native-image"
import { CopyBlock } from "./copy-block"
import { JoinButtons } from "./join-buttons"

export const dynamic = "force-dynamic"
export const metadata = { title: "Become a Playtester | D20 Adventures" }

const repo = "https://github.com/johnpolacek/d20adventures.com"
const installCommand = "curl -fsSL https://d20adventures.com/install.sh | sh"
const soloDemo = "/settings/realm-of-myr/the-midnight-summons"
const installSource = `${repo}/blob/main/public/install.sh`
const setupPrompt = `Set me up as a D20 Adventures playtester on this Mac.

1. Check that this is an Apple Silicon Mac with Node.js 24 or newer. If not, tell me how to fix it and stop.
2. Read the install script before running it: https://d20adventures.com/install.sh
3. Run it: ${installCommand}
4. Open D20 Adventures. It shows a code to link it to my account: help me approve it at https://d20adventures.com/desktop/link, and sign up there first if I have no account.
5. Help me start The Midnight Summons.
6. Show me how to invite a friend to my game, and how to send feedback when something breaks.
7. Tell me what you did and anything that failed.

Source: ${repo}`

const steps: { title: string; body: string; icon: LucideIcon }[] = [
  { title: "Host", body: "Run the app on your Mac. The Game Master uses your own Claude, Codex or Grok.", icon: Castle },
  { title: "Invite", body: "Friends join your game from the website with a link.", icon: ScrollText },
  { title: "Report", body: "Tell us what worked and what broke.", icon: Feather },
]

const requirements = ["Apple Silicon Mac", "Node.js 24 or Newer", "Claude, Codex or Grok CLI"]

const eyebrow = "font-display text-sm tracking-[0.2em] uppercase text-amber-200/80"
const heading = "font-display text-xl text-indigo-300"
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
            <div className={eyebrow}>{joined ? "Welcome to the Alpha" : "Alpha Playtest"}</div>
            <h1 className="mt-3 font-display text-4xl leading-tight text-blue-50 sm:text-5xl">{joined ? "You’re a Playtester" : "Become a Playtester"}</h1>
            <p className="mt-4 font-serif text-lg leading-relaxed text-white/80">
              Run a tabletop adventure with an AI Game Master. Host it on your Mac, and your friends join from the web. D20 Adventures is in alpha, so expect rough edges.
            </p>
            <div className={`mt-8 ${hairline}`} />
          </header>

          <div className="space-y-10 px-6 pt-8 pb-10 sm:px-10 lg:px-14">
            <ul className="grid gap-6 sm:grid-cols-3">
              {steps.map((step) => (
                <li key={step.title} className="flex gap-3">
                  <step.icon className="mt-1 size-5 shrink-0 text-amber-300" strokeWidth={1.5} />
                  <div>
                    <h2 className={heading}>{step.title}</h2>
                    <p className="mt-1 font-serif text-white/70">{step.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <ul className="flex flex-wrap gap-2">
              {requirements.map((item) => (
                <li key={item} className="rounded-full border border-amber-200/20 px-3 py-1 font-sans text-xs tracking-wide text-white/75">
                  {item}
                </li>
              ))}
            </ul>

            <section>
              <h2 className={heading}>Give Claude This</h2>
              <p className="mt-2 font-serif text-white/75">Paste it into Claude Code and it walks you through the rest. We recommend Claude Opus 5.5 on medium effort.</p>
              <CopyBlock label="Prompt" text={setupPrompt} className="mt-4" />
            </section>

            <section>
              <h2 className={heading}>Or Install It Yourself</h2>
              <CopyBlock label="Terminal" text={installCommand} className="mt-4" />
            </section>

            <div className={hairline} />

            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
              {joined ? (
                <p className="font-serif text-white/75">You’re signed in, so the app can link to your account.</p>
              ) : (
                <JoinButtons />
              )}
              <Link href={soloDemo} className="shrink-0 pt-3 font-display text-amber-200/85 underline decoration-amber-200/40 underline-offset-4 hover:text-amber-200 hover:decoration-amber-200">
                Or Play the Solo Demo
              </Link>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-amber-200/15 px-6 py-4 font-sans text-sm tracking-wide">
            <a href={repo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/75 hover:text-amber-200">
              <Github className="size-4" />
              View on GitHub
            </a>
            <a href={installSource} target="_blank" rel="noopener noreferrer" className="text-white/75 underline decoration-amber-200/40 underline-offset-4 hover:text-amber-200">
              View the Install Script
            </a>
          </footer>
        </article>
      </div>
    </div>
  )
}
