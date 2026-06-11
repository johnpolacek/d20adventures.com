// Pure input analysis extracted from narrative-service

export function analyzePlayerInput(input: string, characterName: string) {
  const hasDoubleQuotes = input.includes('"') || input.includes("\u201c") || input.includes("\u201d")
  const hasSingleQuoteDialogue =
    /'[A-Z][^']*[.!?,]'\s*\w+\s*(said|says|asks|replies|shouts|whispers|calls|thinks|shouted|yelled|screamed|cried)/i.test(input) ||
    /\w+\s*(said|says|asks|replies|shouts|whispers|calls|thinks|shouted|yelled|screamed|cried)\s*'[A-Z][^']*[.!?,]'/i.test(input)
  const hasDialogue = hasDoubleQuotes || hasSingleQuoteDialogue

  const hasDialogueTags =
    input.includes(" says") ||
    input.includes(" asks") ||
    input.includes(" replies") ||
    input.includes(" states") ||
    input.includes(" whispers") ||
    input.includes(" shouts") ||
    input.includes(" calls") ||
    input.includes(" thinks") ||
    input.includes('" she ') ||
    input.includes('" he ') ||
    input.includes('" they ')

  const inputWithoutQuotes = input
    .replace(/"[^"]*"/g, "")
    .replace(/[\u201c\u201d][^"]*[\u201c\u201d]/g, "")
    .replace(/'[A-Z][^']*[.!?]'\s*(said|says|asks|replies|shouts|whispers|calls|thinks)/gi, "")
    .replace(/(said|says|asks|replies|shouts|whispers|calls|thinks)\s*'[A-Z][^']*[.!?]'/gi, "")

  const isFirstPerson = /\b(i|me|my|myself|i'm|i'll|i've)\b/i.test(inputWithoutQuotes)
  const isThirdPerson = new RegExp(`\\b${characterName}\\b`, "i").test(input) || /\b(he|she|they|him|her|them)\b/i.test(input)

  const wordCount = input.split(/\s+/).filter((word) => word.length > 0).length
  const sentenceCount = input.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
  const hasNarrative = sentenceCount > 1 || (sentenceCount === 1 && wordCount > 8)
  const isMinimal = wordCount < 5
  const isSubstantial = wordCount > 15

  const hasPresentTense = /\b(approaches|walks|says|asks|looks|moves|takes|draws|attacks|casts|runs|thinks|states|weaves|examines)\b/i.test(input)
  const hasPastTense = /\b(approached|walked|said|asked|looked|moved|took|drew|attacked|cast|ran|went|came|did|was|were)\b/i.test(input) && !/\b(states|thinks|weaves)\b/i.test(input)

  const hasCharacterThoughts = /thinks to (herself|himself|themselves)/i.test(input)
  const hasDetailedAction = sentenceCount >= 2 && wordCount >= 20
  const hasGoodStructure = hasDialogue && (hasDialogueTags || hasCharacterThoughts) && isThirdPerson

  // Imperative/instructional text detection (e.g., "continue to shoot", "attack the guard")
  const isImperative = /^(continue|attack|shoot|run|go|hide|move|cast|use|take|grab|try|attempt|shout|say|tell|ask)\b/i.test(input.trim())

  return {
    hasDialogue,
    hasDialogueTags,
    isFirstPerson,
    isThirdPerson,
    wordCount,
    sentenceCount,
    hasNarrative,
    isMinimal,
    isSubstantial,
    hasPresentTense,
    hasPastTense,
    hasCharacterThoughts,
    hasDetailedAction,
    hasGoodStructure,
    isImperative,
    isWellWritten: (hasGoodStructure || hasDialogue || (isThirdPerson && hasNarrative && !isFirstPerson && hasPresentTense)) && !isMinimal && !hasPastTense && !isImperative,
    needsEnhancement: (isMinimal || (isFirstPerson && !hasDialogue) || hasPastTense || isImperative) && !(hasGoodStructure || (hasDetailedAction && isThirdPerson) || hasDialogue),
    preserveOriginal:
      (hasGoodStructure ||
        (hasDetailedAction && isThirdPerson && !isImperative) ||
        (hasDialogue && hasDialogueTags && isThirdPerson && !hasPastTense) ||
        (hasDialogue && hasDialogueTags && !isMinimal)) &&
      !(isFirstPerson && !hasDialogue),
    useMinimalCorrections: (hasDialogue && isThirdPerson && !isMinimal && !hasPastTense) || (hasDialogue && hasDialogueTags && !isMinimal && !hasPastTense),
  }
}
