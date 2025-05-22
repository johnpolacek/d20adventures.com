// Utility to parse narrative with [DiceRoll:rollType=...;result=...;difficulty=...;character=...;image=...;success=...]

export type NarrativePart =
  | { type: 'paragraph'; value: string }
  | { type: 'diceroll'; rollType: string; result: number; difficulty: number; character: string; image?: string; success: boolean };

const diceRollRegex = /^\[DiceRoll:([^\]]+)\]$/i;

export function parseNarrative(narrative: string): NarrativePart[] {
  return narrative.split(/\n+/).map<NarrativePart>(line => {
    const trimmed = line.trim();
    const match = trimmed.match(diceRollRegex);
    if (match) {
      // Parse key=value pairs
      const fields = Object.fromEntries(
        match[1].split(';').map(pair => {
          const [key, ...rest] = pair.split('=');
          return [key.trim(), rest.join('=').trim()];
        })
      );
      return {
        type: 'diceroll',
        rollType: fields.rollType || '',
        result: Number(fields.result),
        difficulty: Number(fields.difficulty),
        character: fields.character || '',
        image: fields.image || '',
        success: fields.success === 'true',
      } as const;
    }
    return { type: 'paragraph', value: trimmed } as const;
  }).filter(part => part.type === 'diceroll' || part.value.length > 0);
} 