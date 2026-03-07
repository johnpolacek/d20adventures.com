"use client"

import { generateEncounterMapAction, generateEncounterMapPromptAction } from "@/app/_actions/generate-encounter-map"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createDefaultEncounterMap, getPropDefaults, getTerrainDefaults, listEncounterOptions } from "@/lib/map-utils"
import type { AdventureEncounter, AdventureSection, Encounter3DMap } from "@/types/adventure-plan"
import dynamic from "next/dynamic"
import * as React from "react"
import { Plus, Wand2 } from "lucide-react"
import { toast } from "sonner"

const MiniaturesMap = dynamic(() => import("@/components/adventure/miniatures-map"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm text-white/60">Loading map preview...</div>,
})

const terrainKinds = ["platform", "wall", "water", "dais", "ramp", "pit"] as const
const propKinds = ["pillar", "crate", "torch", "statue", "tree", "rock", "table", "stairs", "banner", "altar"] as const

interface EncounterMapEditorProps {
  encounter: AdventureEncounter
  allSections: AdventureSection[]
  maxPartySize: number
  isSaving: boolean
  onMapChange: (map: Encounter3DMap | undefined) => void
}

function buildSuggestedPrompt(encounter: AdventureEncounter) {
  if (encounter.intro.trim().length > 0) {
    return "Drafting a map prompt from the encounter intro..."
  }

  return `Create a tabletop 3D encounter map for ${encounter.title || "this encounter"}.`
}

export function EncounterMapEditor({ encounter, allSections, maxPartySize, isSaving, onMapChange }: EncounterMapEditorProps) {
  const sectionTitle = React.useMemo(() => allSections.find((section) => section.scenes.some((scene) => scene.encounters.some((entry) => entry.id === encounter.id)))?.title, [allSections, encounter.id])
  const sceneTitle = React.useMemo(
    () =>
      allSections
        .flatMap((section) => section.scenes)
        .find((scene) => scene.encounters.some((entry) => entry.id === encounter.id))
        ?.title || "",
    [allSections, encounter.id]
  )
  const defaultPrompt = React.useMemo(() => buildSuggestedPrompt(encounter), [encounter])
  const [prompt, setPrompt] = React.useState(defaultPrompt)
  const [suggestedPrompt, setSuggestedPrompt] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isDraftingPrompt, setIsDraftingPrompt] = React.useState(false)
  const [copySourceId, setCopySourceId] = React.useState("")
  const requestKeyRef = React.useRef<string | null>(null)

  const map = encounter.map3d
  const encounterOptions = React.useMemo(() => listEncounterOptions(allSections, encounter.id).filter((option) => option.hasMap), [allSections, encounter.id])

  React.useEffect(() => {
    setPrompt(defaultPrompt)
    setSuggestedPrompt("")
    requestKeyRef.current = null
  }, [defaultPrompt])

  const updateMap = (updater: (current: Encounter3DMap) => Encounter3DMap) => {
    const next = updater(map || createDefaultEncounterMap(encounter.title))
    onMapChange(next)
  }

  const draftPromptFromEncounter = React.useCallback(
    async (forceReplace: boolean) => {
      if (!encounter.intro.trim()) {
        const fallbackPrompt = buildSuggestedPrompt(encounter)
        setSuggestedPrompt(fallbackPrompt)
        setPrompt((currentPrompt) => (forceReplace || currentPrompt.trim().length === 0 ? fallbackPrompt : currentPrompt))
        return
      }

      setIsDraftingPrompt(true)
      try {
        const nextPrompt = await generateEncounterMapPromptAction({
          sectionTitle,
          sceneTitle,
          encounterTitle: encounter.title,
          encounterIntro: encounter.intro,
          encounterInstructions: encounter.instructions,
          encounterNpcRefs: encounter.npc,
        })
        setSuggestedPrompt(nextPrompt)
        setPrompt((currentPrompt) => (forceReplace || currentPrompt.trim().length === 0 || currentPrompt === defaultPrompt ? nextPrompt : currentPrompt))
      } catch (error) {
        console.error("Failed to draft encounter map prompt:", error)
        const fallbackPrompt = `Create a stylized tabletop 3D environment for ${encounter.title || "this encounter"}, based on this scene: ${encounter.intro.trim()}`
        setSuggestedPrompt(fallbackPrompt)
        setPrompt((currentPrompt) => (forceReplace || currentPrompt.trim().length === 0 ? fallbackPrompt : currentPrompt))
        toast.error("Failed to draft a prompt from the intro. Using a fallback prompt instead.")
      } finally {
        setIsDraftingPrompt(false)
      }
    },
    [defaultPrompt, encounter, sceneTitle, sectionTitle]
  )

  React.useEffect(() => {
    if (!map) return

    const requestKey = `${encounter.id}:${encounter.intro}:${encounter.instructions}`
    if (requestKeyRef.current === requestKey) return

    requestKeyRef.current = requestKey
    void draftPromptFromEncounter(true)
  }, [draftPromptFromEncounter, encounter.id, encounter.instructions, encounter.intro, map])

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error("Add a prompt before generating a map.")
      return
    }

    setIsGenerating(true)
    generateEncounterMapAction({
      prompt,
      sectionTitle,
      sceneTitle,
      encounterTitle: encounter.title,
      encounterIntro: encounter.intro,
      encounterInstructions: encounter.instructions,
      encounterNpcRefs: encounter.npc,
      maxPartySize,
      existingMap: map,
    })
      .then((generated) => {
        onMapChange(generated)
        setPrompt(suggestedPrompt || defaultPrompt)
        toast.success(map ? "Map updated from prompt." : "Map generated.")
      })
      .catch((error) => {
        console.error("Failed to generate encounter map:", error)
        toast.error("Map generation failed.")
      })
      .finally(() => {
        setIsGenerating(false)
      })
  }

  const handleCopyFromEncounter = () => {
    if (!copySourceId) return
    const sourceEncounter =
      allSections
        .flatMap((section) => section.scenes)
        .flatMap((scene) => scene.encounters)
        .find((entry) => entry.id === copySourceId) || null

    if (!sourceEncounter?.map3d) {
      toast.error("Selected encounter has no map to copy.")
      return
    }

    onMapChange({
      ...sourceEncounter.map3d,
      promptHistory: [...sourceEncounter.map3d.promptHistory, `Copied from ${copySourceId}`],
    })
    toast.success("Map copied from encounter.")
  }

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Label className="pl-2 text-lg font-display text-amber-400/90">3D Map</Label>
        {map ? (
          <Button variant="ghost" size="sm" disabled={isSaving || isGenerating} onClick={() => onMapChange(undefined)} className="text-xs text-red-300 hover:text-red-200">
            Remove Map
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={isSaving || isGenerating} onClick={() => onMapChange(createDefaultEncounterMap(encounter.title))} className="font-mono">
            <Plus className="mr-2 h-4 w-4" />
            Add 3D Map
          </Button>
        )}
      </div>

      {!map ? (
        <p className="text-xs italic text-white/55">No map yet. Enable it to draft a scene with AI or build one manually.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <Label htmlFor={`map-prompt-${encounter.id}`} className="mb-1 block text-xs font-mono text-primary-200/90">
                  Prompt Draft / Revision
                </Label>
                <Textarea
                  id={`map-prompt-${encounter.id}`}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={4}
                  disabled={isSaving || isGenerating || isDraftingPrompt}
                  placeholder={suggestedPrompt || defaultPrompt}
                  className="bg-black/30 placeholder:text-white/35"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-white/45">{encounter.intro.trim().length > 0 ? "AI rewrites the encounter intro into a spatial map-design prompt." : "No encounter intro yet, so the prompt falls back to a generic map request."}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSaving || isGenerating || isDraftingPrompt}
                    onClick={() => void draftPromptFromEncounter(true)}
                    className="shrink-0"
                  >
                    <Wand2 className="mr-2 h-3.5 w-3.5" />
                    {isDraftingPrompt ? "Drafting..." : "Rewrite from Intro"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block text-xs font-mono text-primary-200/90">Copy Existing Map</Label>
                  <select
                    value={copySourceId}
                    onChange={(event) => setCopySourceId(event.target.value)}
                    className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm text-white"
                    disabled={isSaving || isGenerating}
                  >
                    <option value="">Select encounter...</option>
                    {encounterOptions.map((option) => (
                      <option key={option.id} value={option.id} className="bg-gray-900">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" size="sm" disabled={!copySourceId || isSaving || isGenerating || isDraftingPrompt} onClick={handleCopyFromEncounter} className="mt-2 w-full">
                    Copy Map
                  </Button>
                </div>

                <Button variant="epic" size="sm" disabled={isSaving || isGenerating || isDraftingPrompt} onClick={handleGenerate} className="w-full">
                  {isGenerating ? "Generating..." : map.promptHistory.length > 0 ? "Revise Map" : "Generate Map"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <MiniaturesMap map={map} title={encounter.title} />

            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div>
                <Label className="mb-1 block text-xs font-mono text-primary-200/90">Summary</Label>
                <Textarea
                  value={map.summary}
                  onChange={(event) => updateMap((current) => ({ ...current, summary: event.target.value }))}
                  rows={3}
                  disabled={isSaving || isGenerating}
                  className="bg-black/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs font-mono text-primary-200/90">Board Width</Label>
                  <Input
                    type="number"
                    min={4}
                    max={48}
                    value={map.board.width}
                    onChange={(event) => updateMap((current) => ({ ...current, board: { ...current.board, width: Number(event.target.value) || current.board.width } }))}
                    disabled={isSaving || isGenerating}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-mono text-primary-200/90">Board Depth</Label>
                  <Input
                    type="number"
                    min={4}
                    max={48}
                    value={map.board.depth}
                    onChange={(event) => updateMap((current) => ({ ...current, board: { ...current.board, depth: Number(event.target.value) || current.board.depth } }))}
                    disabled={isSaving || isGenerating}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-mono text-primary-200/90">Cell Size</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={4}
                    step={0.25}
                    value={map.board.cellSize}
                    onChange={(event) => updateMap((current) => ({ ...current, board: { ...current.board, cellSize: Number(event.target.value) || current.board.cellSize } }))}
                    disabled={isSaving || isGenerating}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-mono text-primary-200/90">Theme</Label>
                  <select
                    value={map.board.theme}
                    onChange={(event) => updateMap((current) => ({ ...current, board: { ...current.board, theme: event.target.value as Encounter3DMap["board"]["theme"] } }))}
                    className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm text-white"
                    disabled={isSaving || isGenerating}
                  >
                    {["stone", "dirt", "wood", "cavern", "sand", "snow"].map((theme) => (
                      <option key={theme} value={theme} className="bg-gray-900">
                        {theme}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-display text-amber-200">Terrain</div>
                  <div className="flex gap-2">
                    {terrainKinds.map((kind) => (
                      <Button
                        key={kind}
                        variant="ghost"
                        size="sm"
                        disabled={isSaving || isGenerating}
                        onClick={() =>
                          updateMap((current) => ({
                            ...current,
                            terrain: [
                              ...current.terrain,
                              {
                                id: `${kind}-${current.terrain.length + 1}`,
                                kind,
                                x: 0,
                                z: 0,
                                y: 0,
                                rotation: 0,
                                color: undefined,
                                label: "",
                                ...getTerrainDefaults(kind),
                              },
                            ],
                          }))
                        }
                        className="px-2 text-[10px]"
                      >
                        + {kind}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {map.terrain.map((terrain, index) => (
                    <div key={terrain.id} className="grid grid-cols-5 gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                      <Input value={terrain.id} onChange={(event) => updateMap((current) => ({ ...current, terrain: current.terrain.map((entry, entryIndex) => (entryIndex === index ? { ...entry, id: event.target.value } : entry)) }))} />
                      <Input type="number" value={terrain.x} onChange={(event) => updateMap((current) => ({ ...current, terrain: current.terrain.map((entry, entryIndex) => (entryIndex === index ? { ...entry, x: Number(event.target.value) || 0 } : entry)) }))} />
                      <Input type="number" value={terrain.z} onChange={(event) => updateMap((current) => ({ ...current, terrain: current.terrain.map((entry, entryIndex) => (entryIndex === index ? { ...entry, z: Number(event.target.value) || 0 } : entry)) }))} />
                      <Input type="number" value={terrain.width} onChange={(event) => updateMap((current) => ({ ...current, terrain: current.terrain.map((entry, entryIndex) => (entryIndex === index ? { ...entry, width: Number(event.target.value) || entry.width } : entry)) }))} />
                      <Button variant="ghost" size="sm" onClick={() => updateMap((current) => ({ ...current, terrain: current.terrain.filter((_, entryIndex) => entryIndex !== index) }))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-display text-amber-200">Props</div>
                  <div className="flex gap-2">
                    {propKinds.slice(0, 5).map((kind) => (
                      <Button
                        key={kind}
                        variant="ghost"
                        size="sm"
                        disabled={isSaving || isGenerating}
                        onClick={() =>
                          updateMap((current) => ({
                            ...current,
                            props: [
                              ...current.props,
                              {
                                id: `${kind}-${current.props.length + 1}`,
                                kind,
                                x: 0,
                                z: 0,
                                y: 0,
                                rotation: 0,
                                color: undefined,
                                label: "",
                                ...getPropDefaults(kind),
                              },
                            ],
                          }))
                        }
                        className="px-2 text-[10px]"
                      >
                        + {kind}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {map.props.map((prop, index) => (
                    <div key={prop.id} className="grid grid-cols-5 gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                      <Input value={prop.id} onChange={(event) => updateMap((current) => ({ ...current, props: current.props.map((entry, entryIndex) => (entryIndex === index ? { ...entry, id: event.target.value } : entry)) }))} />
                      <Input type="number" value={prop.x} onChange={(event) => updateMap((current) => ({ ...current, props: current.props.map((entry, entryIndex) => (entryIndex === index ? { ...entry, x: Number(event.target.value) || 0 } : entry)) }))} />
                      <Input type="number" value={prop.z} onChange={(event) => updateMap((current) => ({ ...current, props: current.props.map((entry, entryIndex) => (entryIndex === index ? { ...entry, z: Number(event.target.value) || 0 } : entry)) }))} />
                      <Input type="number" value={prop.scale} onChange={(event) => updateMap((current) => ({ ...current, props: current.props.map((entry, entryIndex) => (entryIndex === index ? { ...entry, scale: Number(event.target.value) || entry.scale } : entry)) }))} />
                      <Button variant="ghost" size="sm" onClick={() => updateMap((current) => ({ ...current, props: current.props.filter((_, entryIndex) => entryIndex !== index) }))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-display text-amber-200">Party Slots</div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSaving || isGenerating}
                    onClick={() =>
                      updateMap((current) => ({
                        ...current,
                        tokenSlots: {
                          ...current.tokenSlots,
                          party: [
                            ...current.tokenSlots.party,
                            {
                              id: `party-${current.tokenSlots.party.length + 1}`,
                              slotIndex: current.tokenSlots.party.length % Math.max(maxPartySize, 1),
                              x: current.tokenSlots.party.length - Math.floor(maxPartySize / 2),
                              y: 0,
                              z: Math.floor(current.board.depth / 2) - 2,
                              facing: 0,
                            },
                          ],
                        },
                      }))
                    }
                  >
                    Add Slot
                  </Button>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {map.tokenSlots.party.map((slot, index) => (
                    <div key={slot.id} className="grid grid-cols-5 gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                      <Input value={slot.id} onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, party: current.tokenSlots.party.map((entry, entryIndex) => (entryIndex === index ? { ...entry, id: event.target.value } : entry)) } }))} />
                      <Input type="number" min={0} max={maxPartySize - 1} value={slot.slotIndex} onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, party: current.tokenSlots.party.map((entry, entryIndex) => (entryIndex === index ? { ...entry, slotIndex: Number(event.target.value) || 0 } : entry)) } }))} />
                      <Input type="number" value={slot.x} onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, party: current.tokenSlots.party.map((entry, entryIndex) => (entryIndex === index ? { ...entry, x: Number(event.target.value) || 0 } : entry)) } }))} />
                      <Input type="number" value={slot.z} onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, party: current.tokenSlots.party.map((entry, entryIndex) => (entryIndex === index ? { ...entry, z: Number(event.target.value) || 0 } : entry)) } }))} />
                      <Button variant="ghost" size="sm" onClick={() => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, party: current.tokenSlots.party.filter((_, entryIndex) => entryIndex !== index) } }))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-display text-amber-200">NPC Slots</div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSaving || isGenerating || !encounter.npc?.length}
                    onClick={() =>
                      updateMap((current) => ({
                        ...current,
                        tokenSlots: {
                          ...current.tokenSlots,
                          npc: [
                            ...current.tokenSlots.npc,
                            {
                              id: `npc-${current.tokenSlots.npc.length + 1}`,
                              npcId: encounter.npc?.[current.tokenSlots.npc.length % encounter.npc.length]?.id || "",
                              x: current.tokenSlots.npc.length - 1,
                              y: 0,
                              z: -Math.floor(current.board.depth / 2) + 2,
                              facing: Math.PI,
                            },
                          ],
                        },
                      }))
                    }
                  >
                    Add NPC Slot
                  </Button>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {map.tokenSlots.npc.map((slot, index) => (
                    <div key={slot.id} className="grid grid-cols-5 gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                      <Input value={slot.id} onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, npc: current.tokenSlots.npc.map((entry, entryIndex) => (entryIndex === index ? { ...entry, id: event.target.value } : entry)) } }))} />
                      <select
                        value={slot.npcId}
                        onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, npc: current.tokenSlots.npc.map((entry, entryIndex) => (entryIndex === index ? { ...entry, npcId: event.target.value } : entry)) } }))}
                        className="rounded-md border border-white/15 bg-black/30 p-2 text-sm text-white"
                      >
                        <option value="">NPC</option>
                        {(encounter.npc || []).map((npc) => (
                          <option key={npc.id} value={npc.id} className="bg-gray-900">
                            {npc.id}
                          </option>
                        ))}
                      </select>
                      <Input type="number" value={slot.x} onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, npc: current.tokenSlots.npc.map((entry, entryIndex) => (entryIndex === index ? { ...entry, x: Number(event.target.value) || 0 } : entry)) } }))} />
                      <Input type="number" value={slot.z} onChange={(event) => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, npc: current.tokenSlots.npc.map((entry, entryIndex) => (entryIndex === index ? { ...entry, z: Number(event.target.value) || 0 } : entry)) } }))} />
                      <Button variant="ghost" size="sm" onClick={() => updateMap((current) => ({ ...current, tokenSlots: { ...current.tokenSlots, npc: current.tokenSlots.npc.filter((_, entryIndex) => entryIndex !== index) } }))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
