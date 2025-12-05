import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"

const geminiModel = google("gemini-3-pro-preview")
const openaiModel = openai("gpt-5-mini")

const currentModel = geminiModel

export { geminiModel, openaiModel, currentModel }
