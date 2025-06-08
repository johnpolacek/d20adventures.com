'use server';

import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";

export type TokenBalanceResponse = {
  tokensRemaining: number | null;
  alltimeTokens: number | null;
  error: string | null;
};

export async function fetchUserTokenBalance(): Promise<TokenBalanceResponse> {
  const { userId } = await auth();
  if (!userId) {
    // Return a specific error object instead of throwing
    return {
      tokensRemaining: null,
      alltimeTokens: null,
      error: "USER_NOT_AUTHENTICATED"
    };
  }

  try {
    // Step 1: Ensure the user token record exists (and grant initial tokens if new)
    await convex.mutation(api.userTokenManagement.ensureUserTokenRecord, { userId });

    // Step 2: Fetch the latest token balance
    const balance = await convex.query(api.userTokenManagement.getTokenBalance, { userId });
    
    return {
      tokensRemaining: balance.tokensRemaining,
      alltimeTokens: balance.alltimeTokens,
      error: null
      // You could also return balance.needsInitialization if the client needs to know
    };
  } catch (error) {
    console.error(`Error fetching token balance for user ${userId}:`, error);
    // Return error object instead of throwing
    return {
      tokensRemaining: null,
      alltimeTokens: null,
      error: `Failed to fetch token balance: ${error instanceof Error ? error.message : String(error)}`
    };
  }
} 