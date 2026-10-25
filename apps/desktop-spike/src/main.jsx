import { ClerkProvider, SignIn, UserButton, useAuth, useSignIn } from "@clerk/react"
import { invoke } from "@tauri-apps/api/core"
import { ConvexProvider, ConvexReactClient, useConvexConnectionState, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"
import { useEffect, useRef, useState } from "react"
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
  const [progress, setProgress] = useState(null)
  const startedAt = useRef(0)
  const displayed = useRef(new Set())
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
    startedAt.current = Date.now()
    displayed.current.clear()
    setProgress(null)
    setResult("")
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
    if (!busy) return
    let active = true
    const timer = setInterval(() => {
      invoke("read_trial_progress")
        .then((value) => {
          if (active && Date.parse(value.recordedAt) >= startedAt.current) setProgress(value)
        })
        .catch(() => {})
    }, 250)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [busy])
  useEffect(() => {
    if (!progress) return
    // Two frames after commit is a visible-render proxy, not first-token timing.
    let secondFrame
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        for (const mark of progress.milestones ?? []) {
          const key = `${progress.provider}:${progress.variant}:${mark.name}`
          if (displayed.current.has(key)) continue
          displayed.current.add(key)
          invoke("record_display", {
            report: {
              recordedAt: progress.recordedAt,
              provider: progress.provider,
              variant: progress.variant ?? "original",
              name: mark.name,
              emittedAt: mark.emittedAt,
              displayedAt: Date.now(),
              serviceElapsedMs: mark.elapsedMs,
            },
          }).catch(() => setError("Display timing recording failed."))
        }
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
    }
  }, [progress])
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
        {["detect", "gm", "images", "turn", "refine"].map((kind) => (
          <button key={kind} disabled={busy} onClick={() => run(kind)}>
            {kind}
          </button>
        ))}
      </nav>
      {busy && <output>Trial running</output>}
      {progress && (
        <section aria-live="polite">
          <h2>
            {progress.provider} {progress.variant}
          </h2>
          {(progress.milestones ?? []).map((mark) => (
            <p key={mark.name}>
              <strong>
                {mark.name}, {(mark.elapsedMs / 1000).toFixed(1)}s
              </strong>
              {mark.text && (
                <>
                  <br />
                  {mark.text}
                </>
              )}
            </p>
          ))}
        </section>
      )}
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
