import { NextRequest, NextResponse } from "next/server";
import adventureData from "@/data/the-midnight-summons.json";

export async function POST(req: NextRequest) {
  const { encounterId } = await req.json();
  console.log("[get-encounter-context] Request for encounterId:", encounterId);
  // Traverse the adventure structure to find the encounter
  let found = null;
  for (const section of adventureData.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (encounter.id === encounterId) {
          found = encounter;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (!found) {
    console.log("[get-encounter-context] Encounter not found for id:", encounterId);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.log("[get-encounter-context] Found encounter:", found.id);
  return NextResponse.json({
    intro: found.intro,
    instructions: found.instructions,
    transitions: found.transitions ?? [],
  });
} 