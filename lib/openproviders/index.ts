import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModelV1 } from "@ai-sdk/provider"
import type { GeminiModel, SupportedModel } from "./types"

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1"

function withPatchedFetch(baseFetch: typeof fetch): typeof fetch {
  return async (url, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const payload = JSON.parse(init.body)
        
        // Handle system_instruction by moving it to messages array as a system message
        if (payload.system_instruction || payload.systemInstruction) {
          const systemContent = payload.system_instruction || payload.systemInstruction
          
          // Initialize messages array if it doesn't exist
          if (!Array.isArray(payload.messages)) {
            payload.messages = []
          }
          
          // Add system message at the beginning of messages array if not already present
          const hasSystemMessage = payload.messages.some(
            (msg: any) => msg.role === 'system'
          )
          
          if (!hasSystemMessage && systemContent) {
            payload.messages.unshift({
              role: 'system',
              content: systemContent
            })
          }
          
          // Remove the old fields
          delete payload.system_instruction
          delete payload.systemInstruction
          
          // Update the request body
          init.body = JSON.stringify(payload)
        }
      } catch (error) {
        console.error('Error processing request payload:', error)
      }
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
