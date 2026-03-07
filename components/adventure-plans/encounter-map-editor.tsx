"use client"

import { generateEncounterMapAction, generateEncounterMapPromptAction } from "@/app/_actions/generate-encounter-map"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createDefaultEncounterMap, enhanceEncounterMap, formatEncounterSceneKit, inferEncounterSceneKit, listEncounterOptions } from "@/lib/map-utils"
import type { AdventureEncounter, AdventureSection, Encounter3DMap } from "@/types/adventure-plan"
import dynamic from "next/dynamic"
import * as React from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

const MiniaturesMap = dynamic(() => import("@/components/adventure/miniatures-map"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm text-white/60">Loading map preview...</div>,
})

interface EncounterMapEditorProps {
  encounter: AdventureEncounter
  allSections: AdventureSection[]
  maxPartySize: number
  isSaving: boolean
  onMapChange: (map: Encounter3DMap | undefined) => void
  onMapPersistRequest: () => void
}

function buildSuggestedPrompt(encounter: AdventureEncounter) {
  if (encounter.intro.trim().length > 0) {
    return "Drafting a map prompt from the encounter intro..."
  }

  return `Create a tabletop 3D encounter map for ${encounter.title || "this encounter"}.`
}

export function EncounterMapEditor({ encounter, allSections, maxPartySize, isSaving, onMapChange, onMapPersistRequest }: EncounterMapEditorProps) {
  const sectionTitle = React.useMemo(() => allSections.find((section) => section.scenes.some((scene) => scene.encounters.some((entry) => entry.id === encounter.id)))?.title, [allSections, encounter.id])
  const sceneTitle = React.useMemo(
    () =>
      allSections
        .flatMap((section) => section.scenes)
        .find((scene) => scene.encounters.some((entry) => entry.id === encounter.id))
        ?.title || "",
    [allSections, encounter.id]
  )
  const inferredSceneKit = React.useMemo(
    () =>
      inferEncounterSceneKit({
        sectionTitle,
        sceneTitle,
        encounterTitle: encounter.title,
        encounterIntro: encounter.intro,
        encounterInstructions: encounter.instructions,
        encounterNpcBehaviors: (encounter.npc || []).map((entry) => entry.behavior),
      }),
    [encounter.instructions, encounter.intro, encounter.npc, encounter.title, sceneTitle, sectionTitle]
  )
  const defaultPrompt = React.useMemo(() => buildSuggestedPrompt(encounter), [encounter])
  const [prompt, setPrompt] = React.useState(defaultPrompt)
  const [suggestedPrompt, setSuggestedPrompt] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isDraftingPrompt, setIsDraftingPrompt] = React.useState(false)
  const [copySourceId, setCopySourceId] = React.useState("")
  const requestKeyRef = React.useRef<string | null>(null)

  const map = encounter.map3d
  const displayMap = React.useMemo(
    () =>
      map
        ? enhanceEncounterMap({ ...map, sceneKit: map.sceneKit || inferredSceneKit }, {
            maxPartySize,
            npcIds: (encounter.npc || []).map((entry) => entry.id),
          })
        : null,
    [encounter.npc, inferredSceneKit, map, maxPartySize]
  )
  const encounterOptions = React.useMemo(() => listEncounterOptions(allSections, encounter.id).filter((option) => option.hasMap), [allSections, encounter.id])

  React.useEffect(() => {
    setPrompt(defaultPrompt)
    setSuggestedPrompt("")
    requestKeyRef.current = null
  }, [defaultPrompt])

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
        onMapPersistRequest()
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

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Label className="pl-2 text-lg font-display text-amber-400/90">3D Map</Label>
        {map ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isSaving || isGenerating}
            onClick={() => {
              onMapChange(undefined)
              onMapPersistRequest()
            }}
            className="text-xs text-red-300 hover:text-red-200"
          >
            Remove Map
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving || isGenerating}
            onClick={() => {
              onMapChange(createDefaultEncounterMap(encounter.title, { sceneKit: inferredSceneKit }))
              onMapPersistRequest()
            }}
            className="font-mono"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add 3D Map
          </Button>
        )}
      </div>

      {!map ? (
        <p className="text-xs italic text-white/55">No map yet. Add one to start drafting and revising the scene via chat.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <Label htmlFor={`map-prompt-${encounter.id}`} className="mb-1 block text-xs font-mono text-primary-200/90">
                  Edit via Chat
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
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block text-xs font-mono text-primary-200/90">Copy Existing Map</Label>
                  <select
                    value={copySourceId}
                    onChange={(event) => {
                      const selectedId = event.target.value
                      setCopySourceId(selectedId)
                      if (!selectedId) return

                      const sourceEncounter =
                        allSections
                          .flatMap((section) => section.scenes)
                          .flatMap((scene) => scene.encounters)
                          .find((entry) => entry.id === selectedId) || null

                      if (!sourceEncounter?.map3d) {
                        toast.error("Selected encounter has no map to copy.")
                        return
                      }

                      onMapChange({
                        ...sourceEncounter.map3d,
                        promptHistory: [...sourceEncounter.map3d.promptHistory, `Copied from ${selectedId}`],
                      })
                      onMapPersistRequest()
                      setCopySourceId("")
                      toast.success("Map copied from encounter.")
                    }}
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
                </div>

                <Button
                  variant="epic"
                  size="sm"
                  disabled={isSaving || isGenerating || isDraftingPrompt}
                  onClick={handleGenerate}
                  className={map.promptHistory.length > 0 ? "px-5 py-2 text-sm tracking-[0.18em]" : "w-full"}
                >
                  {isGenerating ? "Generating..." : map.promptHistory.length > 0 ? "Redraw" : "Generate"}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <MiniaturesMap map={displayMap || map} title={encounter.title} className="w-full" />
              {isGenerating && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/35 backdrop-blur-[2px]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-2xl">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-200" />
                  </div>
                </div>
              )}
            </div>

            <div className="w-full space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 text-xs font-mono uppercase tracking-[0.25em] text-primary-200/70">Summary</div>
                  <p className="text-sm text-white/80">{displayMap?.summary || map.summary || "No summary yet."}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 text-xs font-mono uppercase tracking-[0.25em] text-primary-200/70">Board</div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-white/80">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">{displayMap?.board.width || map.board.width} width</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">{displayMap?.board.depth || map.board.depth} depth</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">{displayMap?.board.cellSize || map.board.cellSize} cell size</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">{displayMap?.board.theme || map.board.theme} theme</div>
                    <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 p-3">{formatEncounterSceneKit(displayMap?.sceneKit || map.sceneKit || inferredSceneKit)} kit</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 text-xs font-mono uppercase tracking-[0.25em] text-primary-200/70">Scene Breakdown</div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-white/80">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">Terrain: {displayMap?.terrain.length || map.terrain.length}</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">Props: {displayMap?.props.length || map.props.length}</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">Zones: {displayMap?.zones.length || map.zones.length}</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">Prompts: {displayMap?.promptHistory.length || map.promptHistory.length}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 text-xs font-mono uppercase tracking-[0.25em] text-primary-200/70">Mini Placement</div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-white/80">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">Party slots: {displayMap?.tokenSlots.party.length || map.tokenSlots.party.length}</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">NPC slots: {displayMap?.tokenSlots.npc.length || map.tokenSlots.npc.length}</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">Encounter NPCs: {encounter.npc?.length || 0}</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">Party cap: {maxPartySize}</div>
                  </div>
                </div>
              </div>

              {(displayMap?.promptHistory.length || map.promptHistory.length) > 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 text-xs font-mono uppercase tracking-[0.25em] text-primary-200/70">Recent Prompts</div>
                  <div className="space-y-2 text-sm text-white/75">
                    {(displayMap?.promptHistory || map.promptHistory).slice(-3).reverse().map((entry, index) => (
                      <div key={`${index}-${entry.slice(0, 16)}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        {entry}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
