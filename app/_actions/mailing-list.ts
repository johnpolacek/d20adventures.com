"use server"

import { auth } from "@clerk/nextjs/server"
import sgMail from "@sendgrid/mail"
import { revalidatePath } from "next/cache"
import {
  addMailingListSubscription,
  removeMailingListSubscription,
  getMailingListSubscriptions
} from "@/lib/services/mailing-list"

// Configure SendGrid and track availability
let isEmailServiceConfigured = false

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  isEmailServiceConfigured = true
} else {
  console.warn("SENDGRID_API_KEY not found. Email service will be disabled.")
}

// Helper to check if email service is available
function isEmailServiceAvailable() {
  return isEmailServiceConfigured
}

export async function subscribe(data: {
  userId: string
  email: string
  name: string | null
}) {
  try {
    const result = await addMailingListSubscription({
      userId: data.userId,
      email: data.email,
      name: data.name ?? undefined,
      // Preferences are no longer passed for waitlist
    })
    revalidatePath("/mailing-list") // Consider if this path is still relevant or needs to be /waitlist
    return {
      success: !!result,
      emailServiceAvailable: isEmailServiceAvailable()
    }
  } catch (error) {
    console.error("Error in subscribe:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to subscribe",
      emailServiceAvailable: isEmailServiceAvailable()
    }
  }
}

export async function unsubscribe(email: string) {
  try {
    const result = await removeMailingListSubscription(email)
    revalidatePath("/mailing-list") // Consider if this path is still relevant
    return {
      success: result,
      emailServiceAvailable: isEmailServiceAvailable()
    }
  } catch (error) {
    console.error("Error in unsubscribe:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unsubscribe",
      emailServiceAvailable: isEmailServiceAvailable()
    }
  }
}

export async function getSubscription() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return {
        success: true as const,
        data: null,
      }
    }
    const subscriptions = await getMailingListSubscriptions()
    // Assuming the shape of subscription object and how to find the relevant one might need adjustment
    // if `unsubscribedAt` or other fields were tied to preferences.
    const sub = subscriptions.find(s => s.userId === userId && s.unsubscribedAt === null)
    return {
      success: true as const,
      data: sub || null,
    }
  } catch (error) {
    console.error("Error in getSubscription:", error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to get subscription",
    }
  }
} 