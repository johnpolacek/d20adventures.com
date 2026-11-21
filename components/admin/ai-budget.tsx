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
        <p className="font-mono text-2xl text-white">
          {dollars(usd)}
          <span className="text-sm text-white/50"> / {dollars(limit)}</span>
        </p>
        <p className="font-mono text-xs text-white/50">
          {calls} {calls === 1 ? "call" : "calls"}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="AI Budget Used" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={usd}>
        <div className={usd >= limit ? "h-full bg-red-400" : usd >= limit * 0.8 ? "h-full bg-amber-400" : "h-full bg-primary-400"} style={{ width: `${limit > 0 ? Math.min(100, (usd / limit) * 100) : 100}%` }} />
      </div>
      <div className="flex items-center gap-2 pt-1">
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
