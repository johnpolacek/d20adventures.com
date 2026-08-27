// Dev-only harness for the encounter-view renderer.
//
// Renders the REAL components/encounterview/encounter-scene from a checked-in
// fixture under public/dev-fixtures, with no auth, no Convex and no S3 — so the
// staging work (RoomShell, the establishing camera, mood lighting) can be looked
// at without spending a generation or booting the backend. Gated hard to
// development: notFound() in any other NODE_ENV, so the route does not exist in a
// production build.
//
//   /dev/scene-preview                                  -> the first fixture
//   /dev/scene-preview?fixture=the-gates                -> a named fixture
//   /dev/scene-preview?fixture=the-gates&time=night&mood=eerie
//                                                       -> same staging, relit
//
// The time/mood overrides exist so the timeOfDay x mood lighting grid can be
// eyeballed without authoring 15 fixtures; they only patch scene.environment.
//
// Character minis come straight out of the fixture as TurnCharacter records.
// CharacterMini resolves a local GLB from race+archetype (asset-catalog's
// CHARACTER_MODEL_RULES), so nothing here needs Convex data or the image proxy —
// keep fixture characters on races/archetypes that match a rule.

import fs from "node:fs/promises"
import path from "node:path"
import { notFound } from "next/navigation"
import { isDev } from "@/lib/auth-utils"
import type { TurnCharacter } from "@/types/adventure"
import { encounterScene3DSchema, sceneMoodSchema, sceneTimeOfDaySchema } from "@/types/encounter-scene-3d"
import { type FixtureSummary, ScenePreviewClient } from "./scene-preview-client"

const FIXTURE_DIR = path.join(process.cwd(), "public", "dev-fixtures")
/** Path traversal guard — the slug is a URL parameter. */
const SLUG = /^[a-z0-9-]{1,64}$/

interface Fixture {
  label?: string
  note?: string
  scene: unknown
  characters: TurnCharacter[]
}

async function listFixtures(): Promise<FixtureSummary[]> {
  const entries = await fs.readdir(FIXTURE_DIR).catch(() => [] as string[])
  const slugs = entries.filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""))
  return Promise.all(
    slugs.sort().map(async (slug) => {
      const fixture = await readFixture(slug)
      return { slug, label: fixture?.label ?? slug }
    })
  )
}

async function readFixture(slug: string): Promise<Fixture | null> {
  if (!SLUG.test(slug)) return null
  const raw = await fs.readFile(path.join(FIXTURE_DIR, `${slug}.json`), "utf8").catch(() => null)
  if (!raw) return null
  return JSON.parse(raw) as Fixture
}

export default async function ScenePreviewPage({ searchParams }: { searchParams: Promise<{ fixture?: string; time?: string; mood?: string }> }) {
  if (!isDev()) notFound()

  const fixtures = await listFixtures()
  if (!fixtures.length) notFound()

  const query = await searchParams
  const requested = query.fixture
  const slug = requested && fixtures.some((f) => f.slug === requested) ? requested : fixtures[0].slug
  const fixture = await readFixture(slug)
  if (!fixture) notFound()

  // Parse through the real schema, so a fixture that has drifted from the current
  // scene shape fails here loudly instead of rendering something misleading.
  const parsed = encounterScene3DSchema.safeParse(fixture.scene)
  if (!parsed.success) {
    return (
      <pre className="m-6 overflow-auto rounded border border-red-500/40 bg-red-950/40 p-4 text-xs text-red-200">
        {`Fixture "${slug}" does not match encounterScene3DSchema:\n\n${JSON.stringify(parsed.error.issues, null, 2)}`}
      </pre>
    )
  }

  const timeOfDay = sceneTimeOfDaySchema.safeParse(query.time)
  const mood = sceneMoodSchema.safeParse(query.mood)
  const scene = {
    ...parsed.data,
    environment: {
      ...parsed.data.environment,
      timeOfDay: timeOfDay.success ? timeOfDay.data : parsed.data.environment.timeOfDay,
      mood: mood.success ? mood.data : parsed.data.environment.mood,
    },
  }

  return <ScenePreviewClient scene={scene} characters={fixture.characters} label={fixture.label ?? slug} note={fixture.note} fixtures={fixtures} active={slug} />
}
