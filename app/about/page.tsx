import type { Metadata } from "next"
import Link from "next/link"
import { PlainPage, plainProse } from "@/components/layout/plain-page"

export const metadata: Metadata = {
  title: "About | D20 Adventures",
  description: "Fantasy adventures with an AI Game Master, solo or with friends.",
}

const repo = "https://github.com/johnpolacek/d20adventures.com"

export default function AboutPage() {
  return (
    <PlainPage title="About">
      <div className={plainProse}>
        <p className="mt-0 text-lg text-white/90">D20 Adventures is a place to play 5e fantasy adventures with an AI Game Master, solo or with friends.</p>

        <h2>How It Plays</h2>
        <ul>
          <li>Make a hero and step into a written adventure.</li>
          <li>Type what you do. The Game Master calls for rolls and tells you what happens.</li>
          <li>Fights and scenes play out on a painted 3D stage with a floor plan.</li>
          <li>The rules follow the SRD 5.2.1.</li>
        </ul>

        <h2>Where To Play</h2>
        <ul>
          <li>On this website, signed in with your account.</li>
          <li>In the desktop app, with games saved on your computer.</li>
        </ul>

        <h2>Open Source</h2>
        <p>
          The code and the adventures are on <a href={repo}>GitHub</a>. You can run it yourself or write your own adventure.
        </p>

        <h2>Early Days</h2>
        <p>
          The game is in alpha. <Link href="/playtest">Become a playtester</Link>, follow the <Link href="/updates">updates</Link>, or <Link href="/contact">get in touch</Link>.
        </p>
      </div>
    </PlainPage>
  )
}
