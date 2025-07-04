import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModelV1 } from "@ai-sdk/provider"
import type { GeminiModel, SupportedModel } from "./types"

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1"

export type OpenProvidersOptions = Parameters<
  ReturnType<typeof createGoogleGenerativeAI>
>[1]

export function openproviders<T extends SupportedModel>(
  modelId: T,
  settings?: OpenProvidersOptions,
  apiKey?: string
): LanguageModelV1 {
  const options = { baseURL: GOOGLE_BASE_URL }
  if (apiKey) {
    const provider = createGoogleGenerativeAI({ apiKey, ...options })
    return provider(modelId as GeminiModel, settings)
  }
  const provider = createGoogleGenerativeAI(options)
  return provider(modelId as GeminiModel, settings)
}
