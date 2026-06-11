import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { isStripeConfigured, stripe } from "@/lib/stripe"

const ALLOWED_DONATION_AMOUNTS = new Set([500]) // cents

export async function POST(request: Request) {
  try {
    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Payment system not configured" }, { status: 503 })
    }

    // Check authentication
    const authResult = await auth()
    if (!authResult.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { amount } = (await request.json()) as { amount?: unknown }
    const parsedAmount = typeof amount === "number" ? amount : Number(amount)

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 })
    }

    if (!ALLOWED_DONATION_AMOUNTS.has(parsedAmount)) {
      return NextResponse.json({ error: "Unsupported payment amount" }, { status: 400 })
    }

    // We can safely use stripe here because we checked isStripeConfigured()
    const paymentIntent = await stripe!.paymentIntents.create({
      amount: parsedAmount,
      currency: "usd",
      metadata: {
        userId: authResult.userId,
        type: "donation",
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
    })
  } catch (error) {
    console.error("Error creating payment intent:", error)
    return NextResponse.json({ error: "Error creating payment intent" }, { status: 500 })
  }
}
