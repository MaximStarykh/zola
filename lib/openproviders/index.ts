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
          payload.system ||
          (await getSystemPrompt()) ||
          ""

        // For Google AI, ensure we always have a system prompt
        if (isGoogleAI) {
          // For Google's API, we need to include the system instruction in the request body
          // as 'systemInstruction' (camelCase) and format it as an array of strings
          if (!payload.config) {
            payload.config = {}
          }
          payload.config.systemInstruction = [systemContent]

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

// Type for Google Search tool configuration
type GoogleSearchTool = {
  googleSearch: { version: string }
}

// Type for model configuration
type ModelConfig = {
  systemInstruction?: string[]
  tools?: GoogleSearchTool[]
  [key: string]: any
}

// Type for our provider options
export interface OpenProvidersOptions {
  config?: ModelConfig
  enableSearch?: boolean
  // Allow any other properties that might be needed
  [key: string]: any
}

export function openproviders<T extends SupportedModel>(
  modelId: T,
  settings?: OpenProvidersOptions & { enableSearch?: boolean },
  apiKey?: string
): LanguageModelV1 {
  const options = {
    baseURL: GOOGLE_BASE_URL,
    fetch: withPatchedFetch(fetch),
  }
  
  // Extract enableSearch from settings
  const { enableSearch, ...modelSettings } = settings || {}
  
  // Create final settings with proper typing
  const finalSettings: OpenProvidersOptions = {
    ...modelSettings,
  }
  
  // Add googleSearch tool to config if enabled
  if (enableSearch) {
    finalSettings.config = {
      ...finalSettings.config,
      tools: [{ googleSearch: { version: '1.0.0' } }]
    } as ModelConfig
  }
  
  // Create the provider with API key if available
  const provider = apiKey 
    ? createGoogleGenerativeAI({ apiKey, ...options })
    : createGoogleGenerativeAI(options)
  
  // Return the model with the final settings
  return provider(modelId as GeminiModel, finalSettings as any)
}
