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
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const payload = JSON.parse(init.body)
        const isGoogleAI = url.toString().includes("generativelanguage.googleapis.com")

        if (isGoogleAI) {
          // Get system prompt from payload or use default
          const systemContent = 
            payload.system_instruction ||
            payload.systemInstruction ||
            payload.system ||
            (await getSystemPrompt()) ||
            ""

          // Create the config object
          const config: any = {}
          
          // Add system instruction if available
          if (systemContent) {
            config.systemInstruction = [systemContent]
          }

          // Create the contents array from messages
          const contents: any[] = []
          
          if (Array.isArray(payload.messages)) {
            // Convert messages to the format Google's API expects
            payload.messages.forEach((msg: any) => {
              if (msg.role === 'user' || msg.role === 'assistant') {
                contents.push({
                  role: msg.role === 'user' ? 'user' : 'model',
                  parts: [{ text: msg.content }]
                })
              }
            })
          }

          // Create new payload with the correct structure
          const newPayload: any = {
            contents: contents
          }

          // Add config if we have any settings
          if (Object.keys(config).length > 0) {
            newPayload.config = config
          }

          // Update the request body with the new payload
          init.body = JSON.stringify(newPayload)
        } else {
          // For other providers, just pass through the original payload
          // No need to modify it as it's not a Google AI request

          // Update the request body
          init.body = JSON.stringify(payload)
        }
      } catch (error) {
        console.error("Error processing request payload:", error)
        // Re-throw to ensure the error is properly handled
        throw error
      }
    }
    
    // Make sure to return the fetch result
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
  const finalSettings: any = {
    ...modelSettings,
  }
  
  // Add googleSearch tool to config if enabled
  if (enableSearch) {
    if (!finalSettings.config) {
      finalSettings.config = {}
    }
    finalSettings.config.tools = [{ googleSearch: { version: '1.0.0' } }]
  }
  
  // Create the provider with API key if available
  const provider = apiKey 
    ? createGoogleGenerativeAI({ apiKey, ...options })
    : createGoogleGenerativeAI(options)
  
  // Return the model with the final settings
  return provider(modelId as GeminiModel, finalSettings)
}
