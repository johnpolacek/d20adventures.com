"use server"

import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server" // Assuming you have a server client setup
import { auth } from "@clerk/nextjs/server"

type UsageTransactionType = "usage_generate_text" | "usage_generate_object" | "usage_image_upload" | "usage_join_adventure"

interface DecrementTokensArgs {
  tokensUsed: number
  transactionType: UsageTransactionType
}

type TokenActionErrorCode = "NOT_AUTHENTICATED" | "INSUFFICIENT_TOKENS" | "DECREMENT_FAILED" | "INCREMENT_FAILED"

type TokenActionSuccess<T> = {
  success: true
  data: T
}

type TokenActionFailure = {
  success: false
  errorCode: TokenActionErrorCode
  error: string
  details?: unknown
}

type DecrementTokensResult = TokenActionSuccess<{ chargedTokens: number }> | TokenActionFailure
type IncrementTokensResult = TokenActionSuccess<{ creditedTokens: number }> | TokenActionFailure

function computeChargedTokens(args: DecrementTokensArgs): number {
  if (args.transactionType === "usage_image_upload" || args.transactionType === "usage_join_adventure") {
    return args.tokensUsed
  }

  // AI generation uses a multiplier: 100 provider tokens = 1 D20 token.
  const TOKEN_DECREMENT_MULTIPLIER = 0.01
  const computed = args.tokensUsed * TOKEN_DECREMENT_MULTIPLIER

  // Keep stable precision for ledger math.
  return Number(computed.toFixed(6))
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function decrementUserTokensAction(args: DecrementTokensArgs): Promise<DecrementTokensResult> {
  const { userId } = await auth()

  if (!userId) {
    console.error("decrementUserTokensAction: User not authenticated. Cannot decrement tokens.")
    return { success: false, errorCode: "NOT_AUTHENTICATED", error: "User not authenticated" }
  }

  if (args.tokensUsed <= 0) {
    console.log("decrementUserTokensAction: No tokens to decrement or invalid amount.", args)
    return { success: true, data: { chargedTokens: 0 } }
  }

  try {
    const chargedTokens = computeChargedTokens(args)

    await convex.mutation(api.userTokenManagement.ensureUserTokenRecord, { userId })
    const result = await convex.mutation(api.userTokenManagement.decrementTokens, {
      userId,
      tokensUsed: chargedTokens,
      transactionType: args.transactionType,
    })

    if (!result.success) {
      return {
        success: false,
        errorCode: "DECREMENT_FAILED",
        error: "Failed to decrement tokens",
      }
    }

    return { success: true, data: { chargedTokens } }
  } catch (error) {
    console.error("decrementUserTokensAction: Failed to decrement tokens for user:", userId, "Error:", error)
    const errorMessage = getErrorMessage(error)
    if (errorMessage.includes("Insufficient tokens")) {
      return {
        success: false,
        errorCode: "INSUFFICIENT_TOKENS",
        error: errorMessage,
        details: error,
      }
    }

    return {
      success: false,
      errorCode: "DECREMENT_FAILED",
      error: "Failed to decrement tokens",
      details: error,
    }
  }
}

export async function incrementUserTokensAction(args: { tokensToCredit: number; transactionType?: "adjustment_manual" | "adjustment_refund" }): Promise<IncrementTokensResult> {
  const { userId } = await auth()

  if (!userId) {
    return { success: false, errorCode: "NOT_AUTHENTICATED", error: "User not authenticated" }
  }

  if (args.tokensToCredit <= 0) {
    return { success: true, data: { creditedTokens: 0 } }
  }

  const credits = Number(args.tokensToCredit.toFixed(6))

  try {
    await convex.mutation(api.userTokenManagement.ensureUserTokenRecord, { userId })
    await convex.mutation(api.userTokenManagement.incrementTokens, {
      userId,
      tokensToCredit: credits,
      transactionType: args.transactionType ?? "adjustment_refund",
    })
    return { success: true, data: { creditedTokens: credits } }
  } catch (error) {
    return {
      success: false,
      errorCode: "INCREMENT_FAILED",
      error: "Failed to credit tokens",
      details: error,
    }
  }
}
