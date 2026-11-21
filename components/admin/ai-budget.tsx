"use client"

import { Button } from "@d20/ui/button"
import { Input } from "@d20/ui/input"
import { useState, useTransition } from "react"
import { setDailyAiBudget } from "@/app/_actions/admin/ai-budget"

const dollars = (usd: number) => `$${usd.toFixed(2)}`

export function AiBudget({ usd, calls, limit }: { usd: number; calls: number; limit: number }) {
  const [value, setValue] = useState(String(limit))
  const [error, setError] = useState<string | null>(null)
  const [saving, save] = useTransition()
  const next = Number(value)
  const valid = value.trim() !== "" && Number.isFinite(next) && next >= 0

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        setError(null)
        save(async () => {
          try {
            await setDailyAiBudget(next)
          } catch {
            setError("Could not save the limit.")
          }
        })
      }}
    >
      <p className="font-mono text-sm text-white/80">
        {dollars(usd)} of {dollars(limit)} today, {calls} {calls === 1 ? "call" : "calls"}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-white/60">$</span>
        <Input aria-label="Daily Limit in US Dollars" type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} className="w-28" />
        <Button type="submit" variant="outline" size="sm" disabled={!valid || saving || next === limit}>
          Save
        </Button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  )
}
