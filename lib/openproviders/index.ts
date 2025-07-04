import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModelV1 } from "@ai-sdk/provider"
import type { GeminiModel, SupportedModel } from "./types"

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1"

function withPatchedFetch(baseFetch: typeof fetch): typeof fetch {
  return async (url, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const payload = JSON.parse(init.body)
        if (payload.systemInstruction && !payload.system_instruction) {
          payload.system_instruction = payload.systemInstruction
          delete payload.systemInstruction
          init.body = JSON.stringify(payload)
        }
      } catch {}
    }
    return baseFetch(url, init)
  }
}

export type OpenProvidersOptions = Parameters<
  ReturnType<typeof createGoogleGenerativeAI>
>[1]

export function openproviders<T extends SupportedModel>(
  modelId: T,
  settings?: OpenProvidersOptions,
  apiKey?: string
): LanguageModelV1 {
  const options = {
    baseURL: GOOGLE_BASE_URL,
    fetch: withPatchedFetch(fetch),
  }
  if (apiKey) {
    const provider = createGoogleGenerativeAI({ apiKey, ...options })
    return provider(modelId as GeminiModel, settings)
  }
  const provider = createGoogleGenerativeAI(options)
  return provider(modelId as GeminiModel, settings)
}
