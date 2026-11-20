import type { Metadata } from "next"
import { ConfigCard } from "@/components/admin/config-card"
import { ContactForm } from "@/components/contact/contact-form"
import { PlainPage } from "@/components/layout/plain-page"

export const metadata: Metadata = {
  title: "Contact | D20 Adventures",
  description: "Questions, bugs or ideas? Send a note.",
}

async function checkEnvironmentVariables() {
  // Define required environment variables
  const requiredEnvVars = {
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
    RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_SENDER: process.env.SENDGRID_SENDER,
    CONTACT_EMAIL: process.env.CONTACT_EMAIL,
  } as const

  // Check which variables are missing
  const missingEnvVars = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  // Log missing variables in development
  if (process.env.NODE_ENV === "development" && missingEnvVars.length > 0) {
    console.warn("⚠️ Missing environment variables for contact form:")
    missingEnvVars.forEach((key) => {
      console.warn(`  - ${key}`)
    })
  }

  return {
    isConfigured: missingEnvVars.length === 0,
    missingVars: missingEnvVars,
  }
}

export default async function ContactPage() {
  const { isConfigured, missingVars } = await checkEnvironmentVariables()

  if (!isConfigured) {
    return (
      <div className="container max-w-2xl py-8 md:py-12">
        <ConfigCard
          title="Contact Form Setup Required"
          description="The contact form needs configuration before it can be used."
          configItems={[
            {
              key: "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
              description: "From Google ReCAPTCHA",
              isMissing: missingVars.includes("NEXT_PUBLIC_RECAPTCHA_SITE_KEY"),
            },
            {
              key: "RECAPTCHA_SECRET_KEY",
              description: "From Google ReCAPTCHA",
              isMissing: missingVars.includes("RECAPTCHA_SECRET_KEY"),
            },
            {
              key: "SENDGRID_API_KEY",
              description: "Your SendGrid API key",
              isMissing: missingVars.includes("SENDGRID_API_KEY"),
            },
            {
              key: "SENDGRID_SENDER",
              description: "Verified sender email in SendGrid",
              isMissing: missingVars.includes("SENDGRID_SENDER"),
            },
            {
              key: "CONTACT_EMAIL",
              description: "Where to receive contact messages",
              isMissing: missingVars.includes("CONTACT_EMAIL"),
            },
          ]}
          filesToRemove={[{ path: "app/contact/page.tsx" }, { path: "components/contact/contact-form.tsx" }, { path: "app/_actions/contact.ts" }]}
        />
      </div>
    )
  }

  return <ContactPageContent />
}

function ContactPageContent() {
  return (
    <PlainPage title="Contact">
      <p className="mb-10 text-center text-lg text-white/80">Questions, bugs or ideas? Send a note and we’ll write back.</p>
      <ContactForm requireCaptcha={true} />
    </PlainPage>
  )
}
