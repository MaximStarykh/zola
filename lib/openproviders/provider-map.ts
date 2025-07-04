import type { Provider, SupportedModel } from "./types"

const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  "gemini-2.5-flash": "google",
  "gemini-2.5-pro": "google",
  "gemma-3": "google",
}

export function getProviderForModel(model: SupportedModel): Provider {
  return MODEL_PROVIDER_MAP[model] || "google"
}
