import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import type { LanguageModelV1 } from "@ai-sdk/provider"
import type { GeminiModel, SupportedModel } from "./types"

export type OpenProvidersOptions = Parameters<typeof google>[1]

export function openproviders<T extends SupportedModel>(
  modelId: T,
  settings?: OpenProvidersOptions,
  apiKey?: string
): LanguageModelV1 {
  if (apiKey) {
    const provider = createGoogleGenerativeAI({ apiKey })
    return provider(modelId as GeminiModel, settings)
  }
  return google(modelId as GeminiModel, settings)
}

