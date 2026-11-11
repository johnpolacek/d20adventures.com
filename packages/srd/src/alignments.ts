import raw from "../data/alignments.json"
import { byId } from "./lookup"
import type { Alignment } from "./schema/reference"

export const alignments = raw as unknown as readonly Alignment[]
export const alignmentById = byId(alignments)
