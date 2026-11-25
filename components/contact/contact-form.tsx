"use client"

import { gsap, prefersReducedMotion, useGSAP } from "@d20/ui/motion"
import { useOptimistic, useRef, useState, useTransition } from "react"
import ReCAPTCHA from "react-google-recaptcha"
import { toast } from "@d20/ui/toast"
import { sendContactEmail } from "@/app/_actions/contact"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { Input } from "@d20/ui/input"
import { Label } from "@d20/ui/label"
import { Swap } from "@d20/ui/presence"
import { Textarea } from "@d20/ui/textarea"
import { useUpdateLook } from "@/components/updates/theme-toggle"

type Draft = { name: string; email: string; message: string }

interface ContactFormProps {
  subject?: string
  requireCaptcha?: boolean
}

export function ContactForm({ subject = "Contact Message", requireCaptcha = false }: ContactFormProps) {
  const [sent, setSent] = useState(false)
  // Shows the thank-you the moment the form is sent. If sending fails, it falls back to the form with the draft intact.
  const [shownSent, showSent] = useOptimistic(sent)
  const [, startTransition] = useTransition()
  const [draft, setDraft] = useState<Draft>({ name: "", email: "", message: "" })
  // The check is drawn by Google in one of two looks, so it follows the page's and is drawn again when that changes.
  // Its answer is kept with the look it was given in, so a new check starts unanswered.
  const look = useUpdateLook() ?? "light"
  const [captcha, setCaptcha] = useState<{ look: string; token: string } | null>(null)
  const captchaToken = captcha?.look === look ? captcha.token : null
  const setCaptchaToken = (token: string | null) => setCaptcha(token ? { look, token } : null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const data: Draft = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      message: String(formData.get("message") ?? ""),
    }
    if (requireCaptcha && !captchaToken) {
      toast.error("Error", { description: "Please complete the reCAPTCHA check." })
      return
    }
    setDraft(data)
    startTransition(async () => {
      showSent(true)
      const result = await sendContactEmail({ ...data, subject, ...(captchaToken && { captchaToken }) })
      // A reCAPTCHA token works once, so a retry or another message needs a fresh check.
      setCaptchaToken(null)
      if (result.success) {
        setSent(true)
      } else {
        toast.error("Message Not Sent", { description: result.error || "There was a problem sending your message. Please try again." })
      }
    })
  }

  return (
    <Swap id={shownSent ? "sent" : "form"}>
      {shownSent ? (
        <ContactSent name={draft.name} />
      ) : (
        <form onSubmit={onSubmit}>
          <div className="up-form">
            <div className="up-form-row">
              <Label plain htmlFor="name" className="up-label">
                Name
              </Label>
              <Input plain id="name" name="name" required defaultValue={draft.name} className="up-field" />
            </div>
            <div className="up-form-row">
              <Label plain htmlFor="email" className="up-label">
                Email
              </Label>
              <Input plain id="email" name="email" type="email" required defaultValue={draft.email} className="up-field" />
            </div>
            <div className="up-form-row">
              <Label plain htmlFor="message" className="up-label">
                Message
              </Label>
              <Textarea plain id="message" name="message" required defaultValue={draft.message} className="up-field" />
            </div>
            {requireCaptcha && <ReCAPTCHA key={look} sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""} theme={look} onChange={(value) => setCaptchaToken(value)} />}
            <div>
              <Button type="submit" variant="plain" className="up-btn is-primary is-lg" disabled={requireCaptcha && !captchaToken}>
                Send Message
              </Button>
            </div>
          </div>
        </form>
      )}
    </Swap>
  )
}

/** The thank-you that takes the form's place: the die tumbles in and lands, then the words rise. */
function ContactSent({ name }: { name: string }) {
  const root = useRef<HTMLDivElement>(null)
  const firstName = name.trim().split(/\s+/)[0]

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const q = gsap.utils.selector(root)
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(q("[data-sent='die']"), { autoAlpha: 0, y: -40, rotation: -200, scale: 0.4, duration: 0.55, ease: "back.out(1.6)" })
        .from(q("[data-sent='glow']"), { autoAlpha: 0, scale: 0.5, duration: 0.45 }, 0.25)
        .from(q("[data-sent='text'] > *"), { autoAlpha: 0, y: 14, duration: 0.35, stagger: 0.07 }, 0.3)
    },
    { scope: root }
  )

  return (
    <div ref={root} className="up-sent" role="status">
      <div className="up-sent-mark">
        <div data-sent="glow" className="up-sent-glow" />
        <Image data-sent="die" src="/images/d20-white.svg" alt="" width={112} height={112} className="up-sent-die" />
      </div>
      <div data-sent="text" className="flex flex-col items-center">
        <p className="up-label">Natural 20</p>
        <h2 className="up-title">Message Sent</h2>
        <p className="up-dek">
          Thanks{firstName ? `, ${firstName}` : ""}. Your note is on its way, and we’ll write back soon.
        </p>
      </div>
    </div>
  )
}

