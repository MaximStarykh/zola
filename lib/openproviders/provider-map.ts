import type { Provider, SupportedModel } from "./types"

const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  "gemini-1.5-flash-002": "google",
  "gemini-1.5-flash-8b": "google",
  "gemini-1.5-pro-002": "google",
  "gemini-2.0-flash-001": "google",
  "gemini-2.0-flash-lite-preview-02-05": "google",
  "gemini-2.5-pro-exp-03-25": "google",
  "gemini-2.5-pro-exp-03-25-pro": "google",
  "gemma-3-27b-it": "google",
}

export function getProviderForModel(model: SupportedModel): Provider {
  return MODEL_PROVIDER_MAP[model] || "google"
}

