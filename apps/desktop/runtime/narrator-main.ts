import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { env } from "@huggingface/transformers"
import { KokoroTTS } from "kokoro-js"

// The narrator's voice for the desktop app: Kokoro on the processor, kept running while the app is open so the model
// loads once. Each line in is a request, and each line out answers it, in turn:
//   {"kind":"load"} → {"ready":true}
//   {"kind":"speak","text":"…","voice":"bf_emma"} → {"audio":"<base64 16-bit PCM>","rate":24000}
// Any failure answers {"error":"…"}. The model (about 90 MB) is fetched once into the app's data folder.

console.log = console.warn = console.error = () => {}
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"
const models = join(dirname(process.argv[2]), "models")
mkdirSync(models, { recursive: true })
env.cacheDir = models

let model: Promise<KokoroTTS> | null = null
const load = () => {
  model ??= KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "cpu" })
  model.catch(() => (model = null))
  return model
}

function pcm16(audio: Float32Array): string {
  const out = new Int16Array(audio.length)
  for (let i = 0; i < audio.length; i++) out[i] = Math.max(-1, Math.min(1, audio[i])) * 0x7fff
  return Buffer.from(out.buffer).toString("base64")
}

const reply = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)

async function main() {
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      const input = JSON.parse(line)
      const tts = await load()
      if (input.kind === "load") reply({ ready: true })
      else {
        const out = await tts.generate(String(input.text), { voice: input.voice })
        reply({ audio: pcm16(out.audio as Float32Array), rate: out.sampling_rate })
      }
    } catch (error) {
      reply({ error: error instanceof Error ? error.message : "The narrator failed." })
    }
  }
  // The app closed the input. The model's library crashes in a normal exit, so the process ends at once.
  process.kill(process.pid, "SIGKILL")
}
void main()
