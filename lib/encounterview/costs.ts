// Encounter view token pricing (D20 tokens, flat per generated asset — cache
// hits are free; failures auto-refund). Scene-spec staging is metered
// separately via the usage_generate_object path (provider tokens x 0.01).
//
// Value anchor: 1,000 D20 tokens ~= $1.00 retail (matches the 200-token image
// upload and the 1,000-token initial grant). Prices target ~4x vendor cost so
// retries, failed chroma keys, and vendor price drift stay inside margin.
//
// Vendor cost basis (verified 2026-07-05):
//   standee  gemini-3.1-flash-image, 1K output  ~$0.067/image
//   3D mini  fal hunyuan3d-v3 "Normal" $0.375 + $0.15 custom face_count = $0.525
//   scene    gemini-3.5-flash ~$0.004/run -> metered charge ~$0.04 (~10x) already
//
// If a vendor price changes, update the table AND the constant together.

/** Full-body standee render, once per character portrait. ~$0.07 cost -> $0.30 retail. */
export const STANDEE_TOKEN_COST = 300

/** 3D miniature generation, once per character portrait. ~$0.53 cost -> $2.00 retail. */
export const MINI3D_TOKEN_COST = 2000
