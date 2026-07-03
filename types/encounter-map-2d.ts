import { z } from "zod"
import { PIECE_IDS } from "@/lib/mapview/piece-catalog"

// Mapview schema v2 — salvaged from the 2d-maps branch (ed402aa) and extended per
// wiki/plans/mapview.md: gridType (hex-ready), registry piece refs instead of bare
// color rects, gameplay semantics preserved. Square grid is the only v1 renderer;
// for gridType "hex", x/y are read as offset (col/row) coordinates so v1 data
// survives a hex-capable v2 without migration.

export const gridTypeSchema = z.enum(["square", "hex"])
export type GridType = z.infer<typeof gridTypeSchema>

export const groundTypeSchema = z.enum(["grass", "dirt", "stone", "sand", "cave", "wood", "snow"])
export type GroundType = z.infer<typeof groundTypeSchema>

// Superset of the 3D scene kits (so inferEncounterSceneKit output is always valid)
// plus 2D-only kits; the generation model picks the best fit from the narrative.
export const mapSceneKitSchema = z.enum(["generic", "checkpoint", "city_gate", "courtyard", "ruins", "shrine", "camp", "road", "crypt", "cavern", "forest", "grove"])
export type MapSceneKit = z.infer<typeof mapSceneKitSchema>

export const pieceGameplayKindSchema = z.enum(["blocking", "difficult", "hazard", "cover", "open"])

export const encounter2dBoardSchema = z.object({
  gridType: gridTypeSchema.default("square"),
  columns: z.number().int().min(8).max(32).default(16),
  rows: z.number().int().min(8).max(24).default(12),
  cellSize: z.number().min(24).max(128).default(48),
  ground: groundTypeSchema.default("grass"),
  lighting: z.enum(["day", "dusk", "night"]).default("day"),
  gridOpacity: z.number().min(0).max(1).default(0.25),
})
export type Encounter2DBoard = z.infer<typeof encounter2dBoardSchema>

export const placedPieceSchema = z.object({
  id: z.string(),
  pieceId: z.enum(PIECE_IDS as [string, ...string[]]),
  x: z.number().min(0).max(64),
  y: z.number().min(0).max(64),
  /** Cells; defaults to the catalog footprint when omitted. */
  width: z.number().min(1).max(32).optional(),
  height: z.number().min(1).max(32).optional(),
  /** Rotation in degrees; normalization snaps to quarter turns (0/90/180/270). */
  rotation: z.number().min(0).max(359).default(0),
  /** Gameplay-semantics override; defaults to the catalog defaultKind. */
  kind: pieceGameplayKindSchema.optional(),
  label: z.string().optional(),
})
export type PlacedPiece = z.infer<typeof placedPieceSchema>

export const encounter2dWallSchema = z.object({
  id: z.string(),
  x1: z.number().min(0).max(64),
  y1: z.number().min(0).max(64),
  x2: z.number().min(0).max(64),
  y2: z.number().min(0).max(64),
  material: z.enum(["stone", "wood", "cliff"]).default("stone"),
  label: z.string().optional(),
})
export type Encounter2DWall = z.infer<typeof encounter2dWallSchema>

export const encounter2dZoneKindSchema = z.enum(["spawn", "objective", "interest"])
export type Encounter2DZoneKind = z.infer<typeof encounter2dZoneKindSchema>

export const encounter2dZoneSchema = z.object({
  id: z.string(),
  kind: encounter2dZoneKindSchema,
  x: z.number().min(0).max(64),
  y: z.number().min(0).max(64),
  width: z.number().min(1).max(64),
  height: z.number().min(1).max(64),
  label: z.string().optional(),
})
export type Encounter2DZone = z.infer<typeof encounter2dZoneSchema>

export const encounter2dLabelSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number().min(0).max(64),
  y: z.number().min(0).max(64),
})
export type Encounter2DLabel = z.infer<typeof encounter2dLabelSchema>

export const encounter2dPartySlotSchema = z.object({
  id: z.string(),
  slotIndex: z.number().int().min(0).max(7),
  x: z.number().min(0).max(64),
  y: z.number().min(0).max(64),
})
export type Encounter2DPartySlot = z.infer<typeof encounter2dPartySlotSchema>

export const encounter2dNpcStartSchema = z.object({
  id: z.string(),
  npcId: z.string(),
  x: z.number().min(0).max(64),
  y: z.number().min(0).max(64),
})
export type Encounter2DNpcStart = z.infer<typeof encounter2dNpcStartSchema>

export const encounter2dNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  x: z.number().min(0).max(64),
  y: z.number().min(0).max(64),
})
export type Encounter2DNote = z.infer<typeof encounter2dNoteSchema>

// What the generation model produces. Party slots and NPC starts are placed
// deterministically afterward (lib/mapview/generate.ts), not by the model.
//
// This schema is deliberately TOLERANT and repairs rather than rejects:
// - No numeric min/max: bounded numbers feed Gemini's constrained decoding, which
//   can digit-loop ("rows": 14000000... forever, observed 2026-07-03). We generate
//   with structuredOutputs off and clamp everything in normalizeGeneration instead.
// - .catch() fallbacks absorb loose enum values (e.g. ground "forest") and missing
//   fields; a preprocess hoists sceneKit/lighting if the model nests them in board.
const generationPieceSchema = z.object({
  id: z.string().catch(""),
  pieceId: z.string(),
  x: z.number().catch(0),
  y: z.number().catch(0),
  width: z.number().optional().catch(undefined),
  height: z.number().optional().catch(undefined),
  rotation: z.number().catch(0).default(0),
  kind: pieceGameplayKindSchema.optional().catch(undefined),
  label: z.string().optional().catch(undefined),
})

export const encounter2dGenerationSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value
    const root = value as Record<string, unknown>
    const board = root.board
    if (board && typeof board === "object") {
      const b = board as Record<string, unknown>
      if (root.sceneKit === undefined && b.sceneKit !== undefined) root.sceneKit = b.sceneKit
      if (b.lighting === undefined && root.lighting !== undefined) b.lighting = root.lighting
    }
    return root
  },
  z.object({
    summary: z.string().catch(""),
    sceneKit: mapSceneKitSchema.catch("generic"),
    board: z
      .object({
        gridType: gridTypeSchema.catch("square").default("square"),
        columns: z.number().catch(16).default(16),
        rows: z.number().catch(12).default(12),
        cellSize: z.number().catch(48).default(48),
        ground: groundTypeSchema.catch("grass").default("grass"),
        lighting: z.enum(["day", "dusk", "night"]).catch("day").default("day"),
        gridOpacity: z.number().catch(0.25).default(0.25),
      })
      .catch({ gridType: "square", columns: 16, rows: 12, cellSize: 48, ground: "grass", lighting: "day", gridOpacity: 0.25 }),
    pieces: z
      .array(generationPieceSchema.catch(null as never))
      .catch([])
      .default([]),
    walls: z
      .array(
        z
          .object({
            id: z.string().catch(""),
            x1: z.number().catch(0),
            y1: z.number().catch(0),
            x2: z.number().catch(0),
            y2: z.number().catch(0),
            material: z.enum(["stone", "wood", "cliff"]).catch("stone").default("stone"),
            label: z.string().optional().catch(undefined),
          })
          .catch(null as never)
      )
      .catch([])
      .default([]),
    zones: z
      .array(
        z
          .object({
            id: z.string().catch(""),
            kind: encounter2dZoneKindSchema.catch("interest"),
            x: z.number().catch(0),
            y: z.number().catch(0),
            width: z.number().catch(1),
            height: z.number().catch(1),
            label: z.string().optional().catch(undefined),
          })
          .catch(null as never)
      )
      .catch([])
      .default([]),
    labels: z
      .array(z.object({ id: z.string().catch(""), text: z.string(), x: z.number().catch(0), y: z.number().catch(0) }).catch(null as never))
      .catch([])
      .default([]),
  })
)
export type Encounter2DGeneration = z.infer<typeof encounter2dGenerationSchema>

export const encounter2dMapSchema = z.object({
  summary: z.string(),
  sceneKit: mapSceneKitSchema,
  board: encounter2dBoardSchema,
  pieces: z.array(placedPieceSchema),
  walls: z.array(encounter2dWallSchema).default([]),
  zones: z.array(encounter2dZoneSchema).default([]),
  labels: z.array(encounter2dLabelSchema).default([]),
  version: z.literal(2).default(2),
  partySlots: z.array(encounter2dPartySlotSchema).default([]),
  npcStarts: z.array(encounter2dNpcStartSchema).default([]),
  notes: z.array(encounter2dNoteSchema).default([]),
  promptHistory: z.array(z.string()).default([]),
})
export type Encounter2DMap = z.infer<typeof encounter2dMapSchema>
