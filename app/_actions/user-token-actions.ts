'use server';

import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";

export async function fetchUserTokenBalance() {
  const { userId } = await auth();
  if (!userId) {
    // Or return a specific error object/status
    throw new Error("User not authenticated. Cannot fetch token balance.");
  }

  try {
    // Step 1: Ensure the user token record exists (and grant initial tokens if new)
    await convex.mutation(api.userTokenManagement.ensureUserTokenRecord, { userId });

    // Step 2: Fetch the latest token balance
    const balance = await convex.query(api.userTokenManagement.getTokenBalance, { userId });
    
    return {
      tokensRemaining: balance.tokensRemaining,
      alltimeTokens: balance.alltimeTokens,
      // You could also return balance.needsInitialization if the client needs to know
    };
  } catch (error) {
    console.error(`Error fetching token balance for user ${userId}:`, error);
    // Depending on client-side handling, you might want to throw the error
    // or return a specific error structure.
    // For the context provider, returning null or an error object might be better.
    throw new Error(`Failed to fetch token balance: ${error instanceof Error ? error.message : String(error)}`);
    // Or: return { tokensRemaining: null, alltimeTokens: null, error: "Failed to fetch balance." };
  }
} 