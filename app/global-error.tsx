"use client"

import { useEffect } from "react"

// The root layout itself threw, so nothing of the site's is loaded: plain markup only.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#000", color: "#fff", fontFamily: "Georgia, serif", textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: 400 }}>Something Went Wrong</h1>
          <p style={{ opacity: 0.7 }}>D20 Adventures failed to load.</p>
          <button type="button" onClick={reset} style={{ marginTop: "1.5rem", padding: "0.6rem 1.4rem", background: "none", color: "#fff", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6, cursor: "pointer", font: "inherit" }}>
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
