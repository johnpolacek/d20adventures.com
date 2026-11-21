import type { ReactNode } from "react"

// Admin pages start below the fixed header, and sit on dark stone: the buried texture multiplied into a deep ink, with a vignette pulling in from the edges.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh pt-14">
      <div aria-hidden className="tex-buried pointer-events-none fixed inset-0 -z-10 bg-[#24212e] bg-[length:350px] bg-blend-multiply" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgb(59_48_110/0.25),transparent_60%),radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.7))]" />
      {children}
    </div>
  )
}
