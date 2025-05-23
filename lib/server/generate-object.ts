import { ZodSchema } from "zod";

export async function generateObject<T>(api: string, schema: ZodSchema<T>, prompt: string): Promise<T> {
  const res = await fetch(api, {
    method: "POST",
    body: JSON.stringify({ prompt }),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch from AI service: ${res.statusText}`);
  }
  const data = await res.json();
  // Validate with Zod schema
  return schema.parse(data.result);
} 