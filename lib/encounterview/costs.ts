// Encounter view token pricing (D20 tokens, flat per generated asset — cache
// hits are free). Scene-spec staging is metered separately from actual LLM
// usage via the usage_generate_object path. Reference points: initial grant is
// 1000 tokens, an image upload charges 200.

/** Full-body standee render (gemini-3.1-flash-image), once per character portrait. */
export const STANDEE_TOKEN_COST = 100

/** 3D miniature generation (fal.ai Hunyuan3D v3), once per character portrait. */
export const MINI3D_TOKEN_COST = 400
