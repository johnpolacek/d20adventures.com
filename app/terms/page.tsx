import type { Metadata } from "next"
import { share } from "@/lib/share"
import Link from "next/link"
import { contactUs, LegalPage, type LegalSection } from "@/components/legal/legal-page"

export const metadata: Metadata = {
  ...share({ title: "Terms of Use", description: "The rules for using D20 Adventures, in plain words." }),
}

const sections: LegalSection[] = [
  {
    title: "Who Can Play",
    body: (
      <ul>
        <li>You must be 13 or older, or the minimum age where you live if higher.</li>
        <li>If you are under 18, a parent or guardian must agree to these terms.</li>
        <li>Keep your login safe. You are responsible for what happens on your account.</li>
      </ul>
    ),
  },
  {
    title: "It’s in Alpha",
    body: (
      <p>
        D20 Adventures is early and changing fast. Features, adventures and saved games may break, change or be reset. It’s free to play for now.
      </p>
    ),
  },
  {
    title: "The AI Game Master",
    body: (
      <ul>
        <li>The story, images and voices are made by AI. AI gets things wrong and can say strange things.</li>
        <li>It’s a game. Don’t treat anything it says as real advice.</li>
        <li>
          What you type is sent to AI services to run the game.
        </li>
      </ul>
    ),
  },
  {
    title: "Your Content",
    body: (
      <p>
        What you write and upload stays yours. You let us store it, show it to the players in your game, and use it to run and improve the service, as the <Link href="/privacy">Privacy Policy</Link> explains. Only share what
        you have the right to share.
      </p>
    ),
  },
  {
    title: "Play Fair",
    body: (
      <>
        <p>Don’t use D20 Adventures, or push the AI, to:</p>
        <ul>
          <li>break the law or share content you don’t have rights to</li>
          <li>harass, threaten or target other people</li>
          <li>post sexual content involving minors, or anyone’s private information</li>
          <li>hack, cheat, scrape or overload the service</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules. If you think we got it wrong, {contactUs}.</p>
      </>
    ),
  },
  {
    title: "Our Content",
    body: (
      <p>
        The adventures, art and site are ours. Some game rules come from the SRD 5.2.1 under CC-BY-4.0. See <Link href="/licenses">Licenses</Link>.
      </p>
    ),
  },
  {
    title: "Tokens",
    body: (
      <p>
        Some actions use tokens. Tokens have no cash value and can’t be sold or transferred. If we start charging for anything, we’ll show the price and
        refund terms before you pay.
      </p>
    ),
  },
  {
    title: "Ending Things",
    body: <p>You can stop playing at any time. To delete your account, {contactUs}. We may suspend or close accounts, or shut down the service.</p>,
  },
  {
    title: "No Guarantees",
    body: (
      <p>
        We provide D20 Adventures as is. We don’t promise it will always work, stay online or keep your data. As far as the law allows, we aren’t liable
        for indirect losses, and our total liability is no more than what you paid us in the past 12 months, or $100, whichever is greater.
      </p>
    ),
  },
  {
    title: "Disputes",
    body: <p>If something goes wrong, {contactUs} first so we can try to fix it. These terms follow Illinois law, and any dispute goes to the courts in Illinois.</p>,
  },
  {
    title: "Changes",
    body: <p>We may update these terms. We’ll tell you before big changes take effect. Playing after that means you accept them.</p>,
  },
  {
    title: "Questions",
    body: <p>For questions, reports or takedown requests, {contactUs}.</p>,
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      updated="November 20, 2026"
      intro={<p>These terms cover the D20 Adventures website and desktop app. By using either, you agree to them.</p>}
      sections={sections}
    />
  )
}
