import type { Metadata } from "next"
import Link from "next/link"
import { contactUs, LegalPage, type LegalSection } from "@/components/legal/legal-page"

export const metadata: Metadata = {
  title: "Privacy Policy | D20 Adventures",
  description: "What D20 Adventures collects and what we do with it, in plain words.",
}

const sections: LegalSection[] = [
  {
    title: "What We Collect",
    body: (
      <ul>
        <li>
          <strong>Account:</strong> your name, email and profile picture, from when you sign in.
        </li>
        <li>
          <strong>Games:</strong> your heroes, what you type, the story and any images you upload.
        </li>
        <li>
          <strong>Messages:</strong> what you send through the contact form, feedback or the mailing list.
        </li>
        <li>
          <strong>Basic tech data:</strong> such as your IP address and browser, kept by the services that host the site.
        </li>
      </ul>
    ),
  },
  {
    title: "How We Use It",
    body: (
      <>
        <ul>
          <li>To run the game and your account.</li>
          <li>To fix bugs and improve the adventures and the Game Master.</li>
          <li>To train or tune AI models. This can include what you type and the stories you play.</li>
          <li>To send emails you asked for. Every email has an unsubscribe link.</li>
          <li>To keep the service safe and enforce the <Link href="/terms">Terms of Use</Link>.</li>
        </ul>
        <p>We don’t sell your data or show ads.</p>
      </>
    ),
  },
  {
    title: "AI Services",
    body: (
      <ul>
        <li>On the website, what you type and the game state go to AI companies, such as OpenAI and Google, to write the story and make images and voices.</li>
        <li>In the desktop app, games are saved on your computer and run through the AI tool you sign in to there.</li>
        <li>Either way, that company’s own terms decide how it keeps or uses the data. We don’t control that.</li>
      </ul>
    ),
  },
  {
    title: "Who Else Sees It",
    body: (
      <ul>
        <li>Players in your game see your hero and what you type.</li>
        <li>Services that help run the site: Clerk for sign-in, Convex for data, Vercel for hosting, Amazon Web Services for files, Resend and SendGrid for email, and Google reCAPTCHA for spam checks.</li>
        <li>Anyone the law requires us to share it with, or when needed to protect people.</li>
        <li>A new owner, if D20 Adventures is ever sold. This policy would still apply.</li>
      </ul>
    ),
  },
  {
    title: "Cookies",
    body: <p>We use cookies to keep you signed in. We don’t use ad or tracking cookies.</p>,
  },
  {
    title: "Keeping and Deleting",
    body: (
      <p>
        We keep your data while your account is open. To see, fix, download or delete it, {contactUs}. Backups may take a while to clear, and data
        already used to train an AI model can’t be pulled back out of it. Where you live may give you more rights, and we’ll honor them.
      </p>
    ),
  },
  {
    title: "Kids",
    body: <p>D20 Adventures is not for children under 13. If we learn we have data from a child under 13, we delete it.</p>,
  },
  {
    title: "Security",
    body: <p>We take reasonable steps to protect your data, but nothing online is perfectly safe.</p>,
  },
  {
    title: "Changes",
    body: <p>We may update this policy. We’ll tell you before big changes take effect.</p>,
  },
  {
    title: "Questions",
    body: <p>For privacy questions or requests, {contactUs}.</p>,
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 20, 2026"
      intro={<p>This covers the D20 Adventures website and desktop app: what we collect, why, and who sees it.</p>}
      sections={sections}
    />
  )
}
