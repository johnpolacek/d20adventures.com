// The narrator's voice in a browser: Kokoro on the graphics card, off the page's thread. On a Mac in Chrome it makes a
// sentence about five times faster than it plays, where the processor only kept pace (2026-11-25). The full-size model
// (about 330 MB, fetched once and kept in the browser's cache) is the one that sounds like the desktop app's: the
// smaller ones heard on the graphics card were duller.

import { KokoroTTS } from "kokoro-js"
import { phonemize } from "./phonemize"
import type { Pronunciations } from "./pronunciations"

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"

type Request = { type: "load" } | { type: "names"; names: Pronunciations } | { type: "speak"; id: number; text: string; voice: string }
type Voice = NonNullable<Parameters<KokoroTTS["generate_from_ids"]>[1]>["voice"]

const post = (message: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(message, transfer)

// How much of the model has come in, summed over its files.
const files = new Map<string, { loaded: number; total: number }>()
function progress(p: { status: string; file?: string; loaded?: number; total?: number }) {
  if (p.status !== "progress" || !p.file || !p.total) return
  files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
  let loaded = 0
  let total = 0
  for (const f of files.values()) {
    loaded += f.loaded
    total += f.total
  }
  post({ type: "progress", share: total ? loaded / total : 0 })
}

let model: Promise<KokoroTTS> | null = null
const load = () => {
  model ??= KokoroTTS.from_pretrained(MODEL, { dtype: "fp32", device: "webgpu", progress_callback: progress as never })
  model.catch(() => (model = null))
  return model
}

let names: Pronunciations = {}

// One sentence at a time, so the first sentence of a paragraph is never stuck behind a sentence of the next.
let queue: Promise<unknown> = Promise.resolve()

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data
  if (req.type === "names") {
    names = req.names
    return
  }
  if (req.type === "load") {
    load().then(
      () => post({ type: "ready" }),
      (err: unknown) => post({ type: "failed", error: String(err) })
    )
    return
  }
  queue = queue.then(async () => {
    try {
      const tts = await load()
      // The sounds are made here, as the desktop's are, so a listed name is said as listed.
      const sounds = await phonemize(req.text, req.voice.startsWith("a") ? "a" : "b", names)
      const { input_ids } = tts.tokenizer(sounds, { truncation: true })
      const out = await tts.generate_from_ids(input_ids, { voice: req.voice as Voice })
      const audio = out.audio as Float32Array
      post({ type: "spoken", id: req.id, audio, rate: out.sampling_rate }, [audio.buffer])
    } catch (err) {
      post({ type: "spoken", id: req.id, error: String(err) })
    }
  })
}
