"use client"

import { useGSAP } from "@gsap/react"
import gsap from "gsap"
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
import { textShadowSpreadLight } from "@d20/ui/typography/styles"

gsap.registerPlugin(useGSAP)

const labelClass = "font-display text-sm tracking-[0.2em] uppercase text-amber-300/90"
const fieldClass = "h-auto py-2.5 border-amber-200/20 bg-black/60 text-base focus-visible:border-amber-200/50"

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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

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
          <p className="mb-10 text-center text-lg text-white/80 text-balance">Questions, bugs or ideas? Send a note and we’ll write back.</p>
          <div className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="name" className={labelClass}>
                Name
              </Label>
              <Input id="name" name="name" required defaultValue={draft.name} className={fieldClass} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email" className={labelClass}>
                Email
              </Label>
              <Input id="email" name="email" type="email" required defaultValue={draft.email} className={fieldClass} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="message" className={labelClass}>
                Message
              </Label>
              <Textarea id="message" name="message" required defaultValue={draft.message} className={`${fieldClass} min-h-44`} />
            </div>
            {requireCaptcha && (
              <div className="w-full">
                <ReCAPTCHA sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""} theme="dark" onChange={(value) => setCaptchaToken(value)} />
              </div>
            )}
          </div>
          <div className="mt-8 flex justify-center">
            <Button type="submit" variant="epic" size="lg" disabled={requireCaptcha && !captchaToken}>
              Send Message
            </Button>
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
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
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
    <div ref={root} className="flex flex-col items-center py-8 text-center" role="status">
      <div className="relative mb-8 size-28">
        <div data-sent="glow" className="absolute inset-0 rounded-full bg-blue-400/30 blur-2xl" />
        <Image data-sent="die" src="/images/d20-white.svg" alt="" width={112} height={112} className="relative size-28 drop-shadow-[0_0_24px_rgba(96,165,250,0.6)]" />
      </div>
      <div data-sent="text" className="flex flex-col items-center">
        <p className="font-display text-sm tracking-[0.3em] uppercase text-amber-300/90">Natural 20</p>
        <h2 className="mt-2 font-display text-4xl sm:text-5xl text-blue-50" style={textShadowSpreadLight}>
          Message Sent
        </h2>
        <p className="mt-4 max-w-md text-lg text-white/80 text-balance">
          Thanks{firstName ? `, ${firstName}` : ""}. Your note is on its way, and we’ll write back soon.
        </p>
      </div>
    </div>
  )
}

