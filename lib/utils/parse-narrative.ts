// Utility to parse narrative with [DiceRoll:rollType=...;result=...;difficulty=...;character=...;image=...;success=...]

export type NarrativePart =
  | { type: 'paragraph'; value: string }
  | { type: 'diceroll'; rollType: string; baseRoll?: number; modifier?: number; result: number; difficulty: number; character: string; image?: string; success: boolean };

const diceRollRegex = /^\[DiceRoll:([^\]]+)\]$/i;

export function parseNarrative(narrative: string): NarrativePart[] {
  // Convert escaped newlines to actual newlines
  const processedNarrative = narrative.replace(/\\n/g, '\n');
  
  return processedNarrative.split(/\n/).map<NarrativePart>(line => {
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
        baseRoll: fields.baseRoll !== undefined && fields.baseRoll !== '' ? Number(fields.baseRoll) : undefined,
        modifier: fields.modifier !== undefined && fields.modifier !== '' ? Number(fields.modifier) : undefined,
        result: Number(fields.result),
        difficulty: Number(fields.difficulty),
        character: fields.character || '',
        image: fields.image || '',
        success: fields.success === 'true',
      } as const;
    }
    return { type: 'paragraph', value: trimmed } as const;
  }).filter(part => part.type === 'diceroll' || (part.type === 'paragraph' && part.value.length > 0));
} 