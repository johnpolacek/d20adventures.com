"use client"

// Mapview Lab — admin development surface for 2D map generation (wiki/plans/mapview.md).
// Pick an encounter, generate or revise its map, review the render and raw JSON.

import { useCallback, useEffect, useState, useTransition } from "react"
import { generateEncounterMap2D, getEncounterMap2D } from "@/app/_actions/mapview"
import { EncounterMap2D } from "@/components/mapview/encounter-map-2d"
import { Button } from "@/components/ui/button"
import type { Encounter2DMap } from "@/types/encounter-map-2d"

export interface MapviewLabEncounter {
  id: string
  title: string
  sectionTitle: string
  sceneTitle: string
  npcCount: number
}

export function MapviewLab({ settingId, planId, encounters }: { settingId: string; planId: string; encounters: MapviewLabEncounter[] }) {
  const [encounterId, setEncounterId] = useState(encounters[0]?.id ?? "")
  const [map, setMap] = useState<Encounter2DMap | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState("")
  const [isPending, startTransition] = useTransition()

  const selected = encounters.find((encounter) => encounter.id === encounterId)

  useEffect(() => {
    if (!encounterId) return
    let cancelled = false
    setLoadingExisting(true)
    setMap(null)
    setError(null)
    getEncounterMap2D(settingId, planId, encounterId)
      .then((existing) => {
        if (!cancelled) setMap(existing)
      })
      .catch(() => {
        if (!cancelled) setMap(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [settingId, planId, encounterId])

  const runGeneration = useCallback(
    (revise: boolean) => {
      setError(null)
      startTransition(async () => {
        try {
          const generated = await generateEncounterMap2D({
            settingId,
            adventurePlanId: planId,
            encounterId,
            prompt: prompt.trim() || undefined,
            revise,
          })
          setMap(generated)
          setPrompt("")
        } catch (generationError) {
          setError(generationError instanceof Error ? generationError.message : "Map generation failed")
        }
      })
    },
    [settingId, planId, encounterId, prompt]
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div>
          <label htmlFor="mapview-encounter" className="mb-1 block text-sm font-medium text-stone-300">
            Encounter
          </label>
          <select
            id="mapview-encounter"
            value={encounterId}
            onChange={(event) => setEncounterId(event.target.value)}
            className="w-full rounded-md border border-stone-700 bg-[#151912] px-3 py-2 text-sm text-stone-100"
          >
            {encounters.map((encounter) => (
              <option key={encounter.id} value={encounter.id}>
                {encounter.title} ({encounter.id})
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-2 text-xs text-stone-500">
              {selected.sectionTitle} · {selected.sceneTitle} · {selected.npcCount} NPC{selected.npcCount === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="mapview-prompt" className="mb-1 block text-sm font-medium text-stone-300">
            Designer request <span className="text-stone-500">(optional)</span>
          </label>
          <textarea
            id="mapview-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="e.g. push the camp against the cliff edge and add a second fire"
            className="w-full rounded-md border border-stone-700 bg-[#151912] px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => runGeneration(false)} disabled={isPending || !encounterId}>
            {isPending ? "Generating…" : map ? "Regenerate" : "Generate map"}
          </Button>
          {map && (
            <Button variant="outline" onClick={() => runGeneration(true)} disabled={isPending}>
              Revise existing
            </Button>
          )}
        </div>

        {error && <p className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}

        {map && (
          <div className="space-y-2 text-sm text-stone-400">
            <p className="italic">{map.summary}</p>
            <p className="font-mono text-xs text-stone-500">
              {map.board.columns}×{map.board.rows} · {map.board.ground} · kit: {map.sceneKit} · {map.pieces.length} pieces
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer text-stone-500 hover:text-stone-300">Raw JSON</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-stone-800 bg-[#0f120d] p-3 text-[11px] leading-snug text-stone-400">{JSON.stringify(map, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>

      <div>
        {map ? (
          <EncounterMap2D map={map} />
        ) : (
          <div className="flex h-96 items-center justify-center rounded-lg border-2 border-dashed border-stone-800 text-stone-600">
            {loadingExisting ? "Checking for an existing map…" : isPending ? "Generating map…" : "No map yet — generate one"}
          </div>
        )}
      </div>
    </div>
  )
}
