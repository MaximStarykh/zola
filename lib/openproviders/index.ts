import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModelV1 } from "@ai-sdk/provider"
import type { GeminiModel, SupportedModel } from "./types"

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1"

async function getSystemPrompt() {
  try {
    // Use dynamic import to avoid circular dependencies
    const config = await import("@/lib/config")
    return config.SYSTEM_PROMPT_DEFAULT || ""
  } catch (error) {
    console.error("Error loading system prompt:", error)
    return ""
  }
}

function withPatchedFetch(baseFetch: typeof fetch): typeof fetch {
  return async (url, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const payload = JSON.parse(init.body)

        // Check if this is a Google Generative AI API request
        const isGoogleAI = url
          .toString()
          .includes("generativelanguage.googleapis.com")

        // Get system prompt from payload or use default
        let systemContent =
          payload.system_instruction ||
          payload.systemInstruction ||
          payload.system

        // For Google AI, ensure we always have a system prompt
        if (isGoogleAI && !systemContent) {
          systemContent = await getSystemPrompt()
        }

        // Handle system instruction if we have one or it's a Google AI request
        if (systemContent || isGoogleAI) {
          if (isGoogleAI) {
            // For Google's API, we need to include the system instruction in the request body
            // as 'systemInstruction' (camelCase) and remove the messages array
            payload.systemInstruction = systemContent || ""

            // Convert messages to the format Google's API expects
            if (Array.isArray(payload.messages)) {
              // Extract the last user message as the prompt
              const lastUserMessage = payload.messages
                .slice()
                .reverse()
                .find((msg: any) => msg.role === "user")

              if (lastUserMessage) {
                payload.prompt = {
                  text: lastUserMessage.content,
                }
              }

              // Remove the messages array as it's not needed
              delete payload.messages
            }
          } else {
            // For other providers, maintain the messages array approach
            if (!Array.isArray(payload.messages)) {
              payload.messages = []
            }

            const hasSystemMessage = payload.messages.some(
              (msg: any) => msg.role === "system"
            )

            if (!hasSystemMessage && systemContent) {
              payload.messages.unshift({
                role: "system",
                content: systemContent,
              })
            }
          }

          // Remove the old fields
          delete payload.system_instruction
          delete payload.systemInstruction
          delete payload.system

          // Update the request body
          init.body = JSON.stringify(payload)
        }
      } catch (error) {
        console.error("Error processing request payload:", error)
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
