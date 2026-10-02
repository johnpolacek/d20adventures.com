import type { Billing } from "@d20/gm-core"
import { decrementUserTokensAction } from "@/app/_actions/tokens"

export class TokenChargeError extends Error {
  constructor(
    message: string,
    public readonly code: "INSUFFICIENT_TOKENS" | "CHARGE_FAILED"
  ) {
    super(message)
    this.name = "TokenChargeError"
  }
}

export function isTokenChargeError(error: unknown): error is TokenChargeError {
  return error instanceof TokenChargeError
}

export async function chargeForUsageOrThrow(totalTokens: number, transactionType: "usage_generate_object" | "usage_generate_text", context: string): Promise<void> {
  if (totalTokens <= 0) return

  const tokenDecrementResult = await decrementUserTokensAction({
    tokensUsed: totalTokens,
    transactionType,
  })

  if (tokenDecrementResult.success) return

  console.error(`Token decrementation failed for ${context}:`, tokenDecrementResult.error, tokenDecrementResult.details)

  if (tokenDecrementResult.errorCode === "INSUFFICIENT_TOKENS") {
    throw new TokenChargeError(`Insufficient tokens for ${context}. Usage: ${totalTokens}.`, "INSUFFICIENT_TOKENS")
  }

  throw new TokenChargeError(`Failed to update token balance after ${context}.`, "CHARGE_FAILED")
}

export const serverBilling: Billing = { chargeUsage: chargeForUsageOrThrow }
