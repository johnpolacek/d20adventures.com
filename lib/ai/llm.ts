import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"

const geminiModel = google("gemini-3.5-flash-lite")
const openaiModel = openai("gpt-5.6-terra")

const currentModel = geminiModel

export { geminiModel, openaiModel, currentModel }
