import { NextRequest } from "next/server";
import { getRollRequirement } from "@/app/_actions/get-roll-requirement";

export async function POST(req: NextRequest) {
  const { reply } = await req.json();
  const rollRequirement = await getRollRequirement(reply);
  return Response.json({ rollRequirement });
} 