import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { useUser } from "@clerk/nextjs"
import { fetchUserTokenBalance } from "@/app/_actions/user-token-actions"

type TokenContextType = {
  tokensRemaining: number | null
  alltimeTokens: number | null
  isLoading: boolean
  error: string | null
  refreshTokens: () => Promise<void>
}

const TokenContext = createContext<TokenContextType | undefined>(undefined)

interface TokenProviderProps {
  children: ReactNode
  pollingInterval?: number // Optional: interval in milliseconds, defaults to 60000
}

export const TokenProvider: React.FC<TokenProviderProps> = ({ children, pollingInterval = 60000 }) => {
  const { isSignedIn, isLoaded } = useUser()
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null)
  const [alltimeTokens, setAlltimeTokens] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const handleFetchTokens = useCallback(async () => {
    // Don't fetch if user is not signed in or Clerk hasn't loaded yet
    if (!isLoaded || !isSignedIn) {
      setTokensRemaining(null)
      setAlltimeTokens(null)
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    try {
      const balance = await fetchUserTokenBalance()
      setTokensRemaining(balance.tokensRemaining)
      setAlltimeTokens(balance.alltimeTokens)
      setError(null)
    } catch (err) {
      console.error("TokenContext: Failed to fetch token balance", err)
      setError(err instanceof Error ? err.message : "An unknown error occurred while fetching token balance.")
      // Keep existing token values if fetch fails, or set to null based on preference
      // setTokensRemaining(null);
      // setAlltimeTokens(null);
    } finally {
      setIsLoading(false)
    }
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    handleFetchTokens() // Initial fetch

    // Only set up polling if user is signed in
    if (isLoaded && isSignedIn) {
      const intervalId = setInterval(() => {
        handleFetchTokens()
      }, pollingInterval)

      return () => clearInterval(intervalId) // Cleanup interval on unmount
    }
  }, [handleFetchTokens, pollingInterval, isLoaded, isSignedIn])

  return <TokenContext.Provider value={{ tokensRemaining, alltimeTokens, isLoading, error, refreshTokens: handleFetchTokens }}>{children}</TokenContext.Provider>
}

export const useTokens = (): TokenContextType => {
  const context = useContext(TokenContext)
  if (context === undefined) {
    throw new Error("useTokens must be used within a TokenProvider")
  }
  return context
}
