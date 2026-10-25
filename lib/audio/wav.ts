// Gemini TTS returns raw PCM (24kHz, 16-bit, mono). Wrapping it in a RIFF/WAV
// header makes it directly playable in browsers without native transcoding deps.

export const GEMINI_TTS_SAMPLE_RATE = 24000
const CHANNELS = 1
const BIT_DEPTH = 16

export function pcmToWav(pcm: Buffer, sampleRate: number = GEMINI_TTS_SAMPLE_RATE): Buffer {
  const byteRate = (sampleRate * CHANNELS * BIT_DEPTH) / 8
  const blockAlign = (CHANNELS * BIT_DEPTH) / 8
  const header = Buffer.alloc(44)

  header.write("RIFF", 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(BIT_DEPTH, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

export function pcmDurationSec(pcm: Buffer, sampleRate: number = GEMINI_TTS_SAMPLE_RATE): number {
  const bytesPerSecond = (sampleRate * CHANNELS * BIT_DEPTH) / 8
  return pcm.length / bytesPerSecond
}

export function silencePcm(seconds: number, sampleRate: number = GEMINI_TTS_SAMPLE_RATE): Buffer {
  const bytesPerSecond = (sampleRate * CHANNELS * BIT_DEPTH) / 8
  return Buffer.alloc(Math.round(seconds * bytesPerSecond))
}
