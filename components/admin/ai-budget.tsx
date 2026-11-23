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
      <div className="flex items-baseline justify-between gap-2">
        <p className="up-stat-value">
          {dollars(usd)}
          <span className="up-small"> / {dollars(limit)}</span>
        </p>
        <p className="up-small">
          {calls} {calls === 1 ? "call" : "calls"}
        </p>
      </div>
      <div className="up-meter" role="meter" aria-label="AI Budget Used" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={usd}>
        <div style={{ width: `${limit > 0 ? Math.min(100, (usd / limit) * 100) : 100}%`, background: usd >= limit ? "var(--up-bad)" : usd >= limit * 0.8 ? "var(--up-warn)" : undefined }} />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="up-small">$</span>
        <Input plain aria-label="Daily Limit in US Dollars" type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} className="up-field !w-28 !py-1.5 !text-sm" />
        <Button type="submit" variant="plain" className="up-btn is-xs" disabled={!valid || saving || next === limit}>
          Save
        </Button>
      </div>
      {error && <p className="up-small up-bad">{error}</p>}
    </form>
  )
}
