'use server'

import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/server"; // Assuming you have a server client setup
import { api } from "@/convex/_generated/api";

interface DecrementTokensArgs {
  tokensUsed: number;
  transactionType: "usage_generate_text" | "usage_generate_object";
  description?: string;
  modelId?: string;
}

export async function decrementUserTokensAction(args: DecrementTokensArgs) {
  const { userId } = await auth(); 

  const TOKEN_DECREMENT_MULTIPLIER = 0.1; // 10 tokens of gemini usage = 1 token of D20 usage
  // 10k Gemini tokens costs about $0.00175 (blended input/output)

  if (!userId) {
    console.error("decrementUserTokensAction: User not authenticated. Cannot decrement tokens.");
    // Depending on strictness, you might throw an error or return a specific failure response
    return { success: false, error: "User not authenticated" };
  }

  if (args.tokensUsed <= 0) {
    console.log("decrementUserTokensAction: No tokens to decrement or invalid amount.", args);
    return { success: true, message: "No tokens to decrement or invalid amount." };
  }

  try {
    const description = args.description || `Token usage for ${args.transactionType}${args.modelId ? ' (' + args.modelId + ')' : ''}`;
    const tokensUsed = args.tokensUsed * TOKEN_DECREMENT_MULTIPLIER;
    const result = await convex.mutation(api.userTokenManagement.decrementTokens, {
      userId,
      tokensUsed,
      transactionType: args.transactionType,
      description: description,
    });
    console.log("decrementUserTokensAction: Tokens decremented successfully for user:", userId, "Result:", result);
    return { success: true, data: result };
  } catch (error) {
    console.error(
      "decrementUserTokensAction: Failed to decrement tokens for user:",
      userId,
      "Error:",
      error
    );
    // Handle specific errors from decrementTokens if needed, e.g., insufficient tokens
    return { success: false, error: "Failed to decrement tokens", details: error };
  }
} 