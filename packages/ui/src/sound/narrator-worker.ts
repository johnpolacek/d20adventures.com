// Kokoro, the narrator's voice, run off the page's thread. The model (about 90 MB) is fetched the first time and kept
// in the browser's cache, so it is free to run and works the same on the site and in the app.

import { KokoroTTS } from "kokoro-js"

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"

type Request = { type: "load" } | { type: "speak"; id: number; text: string; voice: string }

let model: Promise<KokoroTTS> | null = null
const load = () => {
  // The processor, not the graphics card: on a Mac in Chrome the graphics card was about three times slower.
  model ??= KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm" })
  model.catch(() => (model = null))
  return model
}

// One sentence at a time: the model runs one job well, and the first sentence of a paragraph is never stuck behind a
// sentence of the next.
let queue: Promise<unknown> = Promise.resolve()

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data
  if (req.type === "load") {
    load().then(
      () => self.postMessage({ type: "ready" }),
      (err: unknown) => self.postMessage({ type: "failed", error: String(err) })
    )
    return
  }
  queue = queue.then(async () => {
    try {
      const tts = await load()
      const out = await tts.generate(req.text, { voice: req.voice as never })
      const audio = out.audio as Float32Array
      self.postMessage({ type: "spoken", id: req.id, audio, rate: out.sampling_rate }, { transfer: [audio.buffer] })
    } catch (err) {
      self.postMessage({ type: "spoken", id: req.id, error: String(err) })
    }
  })
}
