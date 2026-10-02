import { ClerkProvider, SignIn, UserButton, useAuth, useSignIn } from "@clerk/react"
import { invoke } from "@tauri-apps/api/core"
import { ConvexProvider, ConvexReactClient, useConvexConnectionState, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import "./style.css"

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL)
const adventuresQuery = makeFunctionReference("adventure:getAllAdventures")

function App() {
  const { isLoaded, isSignedIn } = useAuth()
  const { signIn } = useSignIn()
  const adventures = useQuery(adventuresQuery, {})
  const connection = useConvexConnectionState()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const [authMethod, setAuthMethod] = useState("interactive-or-existing-session")
  async function testSignIn() {
    setError("")
    try {
      const { ticket } = await invoke("test_auth")
      const result = await signIn.ticket({ ticket })
      if (result.error || signIn.status !== "complete") throw new Error("Incomplete sign-in")
      await signIn.finalize()
      setAuthMethod("development-account-single-use-ticket")
    } catch {
      setError("Native test sign-in failed.")
    }
  }
  async function run(kind) {
    setBusy(true)
    setError("")
    try {
      setResult(JSON.stringify(await invoke("run_suite", { kind }), null, 2))
    } catch {
      setError("Trial failed. Check the native process exit status.")
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    invoke("record_webview", {
      report: {
        origin: location.origin,
        userAgent: navigator.userAgent,
        clerkLoaded: Boolean(isLoaded),
        signedIn: Boolean(isSignedIn),
        convexConnected: connection.isWebSocketConnected,
        queryResolved: adventures !== undefined,
        adventureCount: adventures?.length ?? null,
        backendAuth: "Existing unauthenticated ConvexProvider, no JWT integration",
        authMethod,
      },
    }).catch(() => setError("Native evidence recording failed."))
  }, [isLoaded, isSignedIn, connection.isWebSocketConnected, adventures, authMethod])
  return (
    <main>
      <h1>D20 Desktop Spike</h1>
      <nav>
        {["detect", "gm", "images", "turn"].map((kind) => (
          <button key={kind} disabled={busy} onClick={() => run(kind)}>
            {kind}
          </button>
        ))}
      </nav>
      {busy && <output>Trial running</output>}
      {error && <p role="alert">{error}</p>}
      <pre>{result}</pre>
      <h2>Webview checks</h2>
      <dl>
        <dt>Origin</dt>
        <dd>{location.origin}</dd>
        <dt>Clerk</dt>
        <dd>{!isLoaded ? "Loading" : isSignedIn ? "Signed in" : "Signed out"}</dd>
        <dt>Convex socket</dt>
        <dd>{connection.isWebSocketConnected ? "Connected" : "Disconnected"}</dd>
        <dt>Convex query</dt>
        <dd>{adventures === undefined ? "Pending" : `${adventures.length} adventures`}</dd>
      </dl>
      {isLoaded &&
        (isSignedIn ? (
          <UserButton />
        ) : (
          <>
            <button onClick={testSignIn}>Test account sign-in</button>
            <SignIn routing="hash" />
          </>
        ))}
    </main>
  )
}
createRoot(document.getElementById("root")).render(
  <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </ClerkProvider>
)
