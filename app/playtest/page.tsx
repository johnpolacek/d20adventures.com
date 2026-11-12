import { auth } from "@clerk/nextjs/server"
import { Castle, Feather, Github, type LucideIcon, ScrollText } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "@/components/ui/native-image"
import { cn } from "@/lib/utils"
import { CopyBlock } from "./copy-block"
import { JoinButtons } from "./join-buttons"

export const dynamic = "force-dynamic"
export const metadata = { title: "Become a Playtester | D20 Adventures" }

const repo = "https://github.com/johnpolacek/d20adventures.com"
const installCommand = "curl -fsSL https://d20adventures.com/install.sh | sh"
const soloDemo = "/settings/realm-of-myr/the-midnight-summons"
const installSource = `${repo}/blob/main/public/install.sh`
const installPrompt = `Install the D20 Adventures desktop app on this Mac.

1. Check that this is an Apple Silicon Mac with Node.js 24 or newer. If Node is missing or older, tell me how to update it and stop.
2. Read the install script before you run it: https://d20adventures.com/install.sh
3. Run it: ${installCommand}
4. Confirm that D20 Adventures.app is in /Applications or ~/Applications and that it opened.
5. Tell me what you did and anything that failed.

Source: ${repo}`

const steps: { numeral: string; title: string; body: string; icon: LucideIcon }[] = [
  { numeral: "I", title: "Host", body: "Run the desktop app. The Game Master uses your own Claude, Codex or Grok account.", icon: Castle },
  { numeral: "II", title: "Invite", body: "Friends join your game from the website with a link. No setup for them.", icon: ScrollText },
  { numeral: "III", title: "Report", body: "Tell us what worked and what broke. D20 Adventures is in alpha.", icon: Feather },
]

const requirements = ["Apple Silicon Mac", "Node.js 24 or Newer", "Claude, Codex or Grok CLI"]

const eyebrow = "font-sans text-[11px] font-medium tracking-[0.3em] text-stage-gold uppercase"
const frame =
  "relative rounded-xl border border-stage-gold/30 bg-[linear-gradient(160deg,rgb(28_25_52/0.92),rgb(7_7_14/0.94))] shadow-[0_24px_60px_#000b,inset_0_1px_0_#fcd34d40,inset_0_0_80px_#0006] backdrop-blur-md"
const title = "bg-gradient-to-b from-amber-50 via-stage-gold to-amber-600 bg-clip-text font-display text-transparent drop-shadow-[0_2px_2px_#000]"

// Gilt brackets at the four corners of a frame.
function Corners() {
  const corner = "pointer-events-none absolute size-4 border-stage-gold/70 transition-colors duration-500 group-hover:border-stage-gold"
  return (
    <>
      <span className={cn(corner, "top-2 left-2 rounded-tl-sm border-t-2 border-l-2")} />
      <span className={cn(corner, "top-2 right-2 rounded-tr-sm border-t-2 border-r-2")} />
      <span className={cn(corner, "bottom-2 left-2 rounded-bl-sm border-b-2 border-l-2")} />
      <span className={cn(corner, "right-2 bottom-2 rounded-br-sm border-r-2 border-b-2")} />
    </>
  )
}

function Rule({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3", className)}>
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-stage-gold/80 sm:w-28" />
      <span className="size-1.5 rotate-45 bg-stage-gold" />
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-stage-gold/80 sm:w-28" />
    </div>
  )
}

function Or() {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-stage-gold/40" />
      <span className={eyebrow}>Or</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-stage-gold/40" />
    </div>
  )
}

function StepCards() {
  return (
    <div className="grid w-full gap-5 sm:grid-cols-3">
      {steps.map((step) => (
        <div key={step.title} className={cn(frame, "group flex flex-col items-center px-6 pt-10 pb-8 text-center transition duration-500 hover:-translate-y-1.5 hover:border-stage-gold/70")}>
          <Corners />
          <div className="relative mb-6 grid size-16 place-items-center">
            <span className="absolute inset-0 rotate-45 rounded-md border border-stage-gold/60 bg-primary-700/80 shadow-[0_0_24px_#fcd34d33,inset_0_0_16px_#000a] transition-shadow duration-500 group-hover:shadow-[0_0_36px_#fcd34d66,inset_0_0_16px_#000a]" />
            <step.icon className="relative size-7 text-stage-gold" strokeWidth={1.5} />
          </div>
          <div className={eyebrow}>{step.numeral}</div>
          <h2 className="mt-2 font-display text-2xl tracking-wide text-stage-cream">{step.title}</h2>
          <span className="my-4 h-px w-20 bg-gradient-to-r from-transparent via-stage-gold/70 to-transparent" />
          <p className="font-serif text-base leading-relaxed text-stage-cream/80">{step.body}</p>
        </div>
      ))}
    </div>
  )
}

function Install() {
  return (
    <div className={cn(frame, "group w-full px-5 py-10 sm:px-12")}>
      <Corners />
      <div className="text-center">
        <div className={eyebrow}>Desktop App · macOS</div>
        <h2 className="mt-3 font-display text-2xl tracking-wide text-stage-cream sm:text-3xl">Install the Desktop App</h2>
        <Rule className="mt-5" />
      </div>

      <div className="mt-9 grid grid-cols-1 gap-9">
        <div>
          <h3 className="mb-1 font-display text-lg tracking-wide text-stage-cream">
            <span className="mr-2 text-stage-gold">1.</span>Paste Into Terminal
          </h3>
          <CopyBlock label="Terminal" text={installCommand} className="mt-4" />
          <ul className="mt-4 flex flex-wrap gap-2">
            {requirements.map((item) => (
              <li key={item} className="rounded-full border border-stage-line/20 bg-primary-800/70 px-3 py-1 font-sans text-xs tracking-wide text-stage-cream/80">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Or />

        <div>
          <h3 className="mb-1 font-display text-lg tracking-wide text-stage-cream">
            <span className="mr-2 text-stage-gold">2.</span>Let Claude Install It
          </h3>
          <p className="font-serif text-stage-cream/80">Paste this into Claude Code. We recommend Claude Opus 5.5 on medium effort.</p>
          <CopyBlock label="Prompt for Claude" text={installPrompt} className="mt-4" />
        </div>

        <Or />

        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="mb-1 font-display text-lg tracking-wide text-stage-cream">
              <span className="mr-2 text-stage-gold">3.</span>Play the Solo Demo Adventure
            </h3>
            <p className="font-serif text-stage-cream/80">The Midnight Summons runs in your browser.</p>
          </div>
          <Button asChild variant="epic" className="shrink-0">
            <Link href={soloDemo}>Play Now</Link>
          </Button>
        </div>
      </div>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-sans text-sm tracking-wide">
        <a href={repo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-stage-cream/85 transition-colors hover:text-stage-gold">
          <Github className="size-4" />
          View on GitHub
        </a>
        <a href={installSource} target="_blank" rel="noopener noreferrer" className="text-stage-cream/85 underline decoration-stage-gold/50 underline-offset-4 transition-colors hover:text-stage-gold">
          View the Install Script
        </a>
      </div>
    </div>
  )
}

export default async function PlaytestersPage() {
  const { userId } = await auth()
  const joined = !!userId

  return (
    <section className="relative isolate overflow-clip px-4 pt-32 pb-24 sm:pt-40">
      <div className="absolute inset-0 -z-10">
        <div className="sticky top-0 h-screen overflow-hidden">
          <Image fill priority src="/stage/realm/realm-of-myr/realm.jpg" alt="" className="scale-105 object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(7_7_14/0.72)_0%,rgb(7_7_14/0.38)_36%,rgb(7_7_14/0.9)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,transparent_25%,rgb(0_0_0/0.6)_100%)]" />
        </div>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-14rem)] w-full max-w-4xl flex-col items-center justify-center gap-12">
        <header className="flex flex-col items-center text-center">
          <div className={eyebrow}>{joined ? "Welcome to the Alpha" : "Alpha Playtest"}</div>
          <h1 className={cn(title, "mt-4 text-4xl leading-tight text-balance sm:text-6xl")}>{joined ? "You’re a Playtester" : "Become a Playtester"}</h1>
          <Rule className="mt-6" />
          <p className="mt-6 max-w-xl font-serif text-lg leading-relaxed text-stage-cream/85 [text-shadow:0_1px_8px_#000]">
            {joined ? "Install the desktop app, gather your party and tell us how it goes." : "Run a tabletop adventure with an AI Game Master. Host on your Mac, and your friends join from the web."}
          </p>
        </header>

        {joined ? (
          <>
            <Install />
            <StepCards />
          </>
        ) : (
          <>
            <StepCards />
            <JoinButtons />
          </>
        )}
      </div>
    </section>
  )
}
