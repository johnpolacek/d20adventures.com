import { share } from "@/lib/share"
import { Heading } from "@d20/ui/typography/heading"
import { auth } from "@clerk/nextjs/server"
import { Github } from "lucide-react"
import Link from "next/link"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { CopyBlock } from "@/components/copy-block"
import { hostPrompt, REPO } from "@/lib/host-prompt"
import { Leaving } from "./leaving"
import { served } from "@/lib/served"

export const dynamic = "force-dynamic"
export const metadata = share({ title: "Become a Playtester", description: "Run a tabletop adventure with an AI Game Master. Host it on your computer, and your friends join from the web." })

const repo = REPO
const soloDemo = "/settings/realm-of-myr/the-midnight-summons"
const installSource = `${repo}/blob/main/public/install.sh`
const setupPrompt = hostPrompt()

const hairline = "h-px w-full bg-gradient-to-r from-accent-200/0 via-accent-200/45 to-accent-200/0"

export default async function PlaytestPage() {
  const { userId } = await auth()
  const joined = !!userId

  return (
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-black">
        <Image fill priority src={served("/stage/realm/realm-of-myr/realm.jpg")} alt="" className="object-cover" />
      </div>
      <div className="container pt-28 pb-24">
        <article className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-accent-200/20 bg-black/90 shadow-float transition-[opacity,scale] duration-200 ease-out has-[[data-leaving]]:pointer-events-none has-[[data-leaving]]:scale-[0.98] has-[[data-leaving]]:opacity-0">
          <header className="px-6 pt-10 sm:px-10 lg:px-14 lg:pt-14">
            <Heading variant="h1" className="bg-[linear-gradient(180deg,#fff7d6_0%,#fcd34d_38%,#b7791f_55%,#fde68a_72%,#a16207_100%)] bg-clip-text text-transparent drop-shadow-[0_2px_6px_#f59e0b55]">{joined ? "You’re a Playtester" : "Become a Playtester"}</Heading>
            <p className="mt-4 font-serif text-lg leading-relaxed text-white/80">
              Run a tabletop adventure with an AI Game Master. Host it on your computer, and your friends join from the web. D20 Adventures is in alpha, so your feedback is appreciated while we are in development.
            </p>
          </header>

          <div className="space-y-8 px-6 pt-8 pb-10 sm:px-10 lg:px-14">
            <section>
              <Heading variant="h3" as="h2">Host a Game</Heading>
              <p className="mt-3 font-serif text-base leading-relaxed text-white/75">
                Paste this prompt into a coding agent on your computer, like{" "}
                <a href="https://claude.com/claude-code" target="_blank" rel="noopener noreferrer" className="text-white underline decoration-accent-200/40 underline-offset-4 transition-[color,opacity] duration-150 hover:text-accent-200 active:opacity-70">
                  Claude Code
                </a>{" "}
                (Opus 5.5 on medium recommended).
              </p>
              <CopyBlock label="Prompt" text={setupPrompt} className="mt-4" />
            </section>

            <div className="flex items-center gap-4">
              <div className={hairline} />
              <span className="shrink-0 font-display text-sm tracking-label uppercase text-accent-200/70">or</span>
              <div className={hairline} />
            </div>

            <div className="text-center">
              <Button variant="epic" render={<Link href={soloDemo} />}>
                Play the Solo Demo
                <Leaving />
              </Button>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-accent-200/15 px-6 py-4 font-sans text-sm tracking-wide">
            <a href={repo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/75 transition-[color,opacity] duration-150 hover:text-accent-200 active:opacity-70">
              <Github className="size-4" />
              View on GitHub
            </a>
            <a href={installSource} target="_blank" rel="noopener noreferrer" className="text-white/75 underline decoration-accent-200/40 underline-offset-4 transition-[color,opacity] duration-150 hover:text-accent-200 active:opacity-70">
              View the Install Script
            </a>
          </footer>
        </article>
      </div>
    </div>
  )
}
