import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";

const geminiModel = google('gemini-2.5-flash-lite'); 
const openaiModel = openai('gpt-5-mini');

export { geminiModel, openaiModel }
