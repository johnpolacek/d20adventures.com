'use server'

import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/server"; // Assuming you have a server client setup
import { api } from "@/convex/_generated/api";

interface DecrementTokensArgs {
  tokensUsed: number;
  transactionType: "usage_generate_text" | "usage_generate_object" | "usage_image_upload";
  description?: string;
  modelId?: string;
}

export async function decrementUserTokensAction(args: DecrementTokensArgs) {
  const { userId } = await auth(); 

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
    
    // Different token calculations for different transaction types
    let tokensUsed: number;
    if (args.transactionType === "usage_image_upload") {
      // Image uploads are a flat rate, no multiplier needed
      tokensUsed = args.tokensUsed;
    } else {
      // AI generation uses a multiplier: 100 tokens of gemini usage = 1 token of D20 usage
      const TOKEN_DECREMENT_MULTIPLIER = 0.01;
      tokensUsed = args.tokensUsed * TOKEN_DECREMENT_MULTIPLIER;
    }
    const result = await convex.mutation(api.userTokenManagement.decrementTokens, {
      userId,
      tokensUsed,
      transactionType: args.transactionType,
      description: description,
    });
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