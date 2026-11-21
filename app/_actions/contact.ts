"use server"

import { z } from "zod"
import { verifyCaptcha } from "./verifyCaptcha"

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(1, "Message is required"),
  subject: z.string().default("Contact Form Submission"),
  captchaToken: z.string().optional(),
})

// The sender's domain must be verified in Resend.
const FROM = process.env.EMAIL_FROM ?? "D20 Adventures <hello@d20adventures.com>"

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function sendContactEmail(data: z.input<typeof contactFormSchema>) {
  try {
    const { name, email, message, subject, captchaToken } = contactFormSchema.parse(data)

    // With a secret set, every message must pass reCAPTCHA. Leaving out the token does not skip it.
    if (process.env.RECAPTCHA_SECRET_KEY) {
      try {
        if (!captchaToken) throw new Error("missing token")
        await verifyCaptcha(captchaToken)
      } catch (error) {
        console.error("Error verifying captcha:", error)
        return { success: false as const, error: "reCAPTCHA verification failed. Please try again." }
      }
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: process.env.CONTACT_EMAIL,
        reply_to: email,
        subject,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `<h2>New Contact Form Submission</h2>
<p><strong>Name:</strong> ${escapeHtml(name)}</p>
<p><strong>Email:</strong> ${escapeHtml(email)}</p>
<p><strong>Message:</strong></p>
<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
      }),
    })

    if (!response.ok) {
      console.error("Error sending contact email:", response.status, await response.text())
      return { success: false as const, error: "Your message could not be sent. Please try again later." }
    }
    return { success: true as const }
  } catch (error) {
    console.error("Error sending contact email:", error)
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to send email" }
  }
}
