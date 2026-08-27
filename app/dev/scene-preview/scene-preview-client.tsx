"use client"

// Client half of the dev scene preview. Mirrors how encounter-panel mounts the
// renderer (next/dynamic, ssr off, three.js kept out of the server bundle) so the
// preview exercises the real component and not a lookalike.

import dynamic from "next/dynamic"
import Link from "next/link"
import type { TurnCharacter } from "@/types/adventure"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"

const EncounterScene = dynamic(() => import("@/components/encounterview/encounter-scene"), { ssr: false })

export interface FixtureSummary {
  slug: string
  label: string
}

export function ScenePreviewClient({
  scene,
  characters,
  label,
  note,
  fixtures,
  active,
}: {
  scene: EncounterScene3D
  characters: TurnCharacter[]
  label: string
  note?: string
  fixtures: FixtureSummary[]
  active: string
}) {
  const { environment } = scene
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/15 bg-black/60 px-4 py-2 text-xs">
        <span className="font-display text-sm text-amber-100">{label}</span>
        <span className="rounded bg-white/10 px-2 py-0.5 font-mono">
          {environment.kit} · {environment.ground} · {environment.timeOfDay} · {environment.mood}
        </span>
        <span className="rounded bg-white/10 px-2 py-0.5 font-mono">
          {scene.props.length} props · {scene.characters.length} minis
        </span>
        <span className="ml-auto flex gap-2">
          {fixtures.map((fixture) => (
            <Link
              key={fixture.slug}
              href={`/dev/scene-preview?fixture=${fixture.slug}`}
              className={fixture.slug === active ? "rounded bg-amber-200 px-2 py-0.5 text-black" : "rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"}
            >
              {fixture.slug}
            </Link>
          ))}
        </span>
      </div>
      {note && <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-[11px] text-stone-400">{note}</p>}
      <div className="min-h-0 flex-1">
        <EncounterScene scene={scene} characters={characters} />
      </div>
    </div>
  )
}
