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
        const enableSearch = payload.enableSearch || false

        if (isGoogleAI) {
          // Get system prompt from payload or use default, ensuring it's always a string
          const getSystemContent = async () => {
            const content = 
              payload.system_instruction ||
              payload.systemInstruction ||
              payload.system ||
              (await getSystemPrompt()) ||
              "";
            
            // Handle case where content is an object
            if (content && typeof content === 'object') {
              try {
                // If it has a text property, use that
                if ('text' in content) {
                  return String(content.text);
                }
                // Otherwise try to stringify the object
                return JSON.stringify(content);
              } catch (e) {
                console.error('Error processing system content:', e);
                return '';
              }
            }
            // Ensure it's a string
            return String(content);
          };
          
          const systemContent = await getSystemContent();

          // Create the contents array from messages
          const contents: any[] = []
          
          if (Array.isArray(payload.messages)) {
            // Process messages in order, ensuring proper role alternation
            let lastRole: string | null = null;
            
            for (const msg of payload.messages) {
              // Skip empty messages
              if (!msg.content) continue;
              
              // Convert role to Gemini's expected format
              let role = msg.role === 'assistant' ? 'model' : 'user';
              
              // Ensure roles alternate properly (Gemini requires strict alternation)
              if (role === lastRole) {
                // If same role as last message, append to the last message
                if (contents.length > 0) {
                  const lastMessage = contents[contents.length - 1];
                  if (lastMessage.role === role) {
                    // Handle different content formats for Gemini API
                    if (typeof msg.content === 'string') {
                      lastMessage.parts.push({ text: msg.content });
                    } else if (Array.isArray(msg.content)) {
                      for (const part of msg.content) {
                        if (typeof part === 'string') {
                          lastMessage.parts.push({ text: part });
                        } else if (part?.text) {
                          lastMessage.parts.push({ text: part.text });
                        }
                      }
                    } else if (msg.content?.text) {
                      lastMessage.parts.push({ text: msg.content.text });
                    }
                    continue;
                  }
                }
              }
              
              // Create new message with parts
              const parts: Array<{ text: string }> = [];
              
              // Handle different content formats for Gemini API
              if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
              } else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                  if (typeof part === 'string') {
                    parts.push({ text: part });
                  } else if (part?.text) {
                    parts.push({ text: part.text });
                  }
                }
              } else if (msg.content?.text) {
                parts.push({ text: msg.content.text });
              }
              
              // Skip if no valid parts after processing
              if (parts.length === 0) continue;
              
              // Add the message to contents with proper parts structure
              contents.push({
                role,
                parts: parts
              });
              
              lastRole = role;
            }
          }

          // Add system message as the first user message if available
          if (systemContent) {
            // If there are existing messages, merge system content with the first user message
            if (systemContent) {
              const systemText = systemContent.trim();
              if (contents.length > 0 && contents[0].role === 'user') {
                // Prepend to the first user message
                contents[0].parts.unshift({ 
                  text: `[System]: ${systemText}\n\n` 
                });
              } else {
                // Add as a new system message
                contents.unshift({
                  role: 'user',
                  parts: [{ text: `[System]: ${systemText}` }]
                });
              }
            }
          }
          
          // Create new payload with the correct structure
          const newPayload: any = {
            contents: contents,
            generationConfig: {
              temperature: payload.temperature || 0.9,
              topK: payload.top_k || 1,
              topP: payload.top_p || 1,
              maxOutputTokens: payload.max_tokens || 2048,
              stopSequences: payload.stop ? (Array.isArray(payload.stop) ? payload.stop : [payload.stop]) : []
            },
            safetySettings: [
              {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
              },
              {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
              },
              {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
              },
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_MEDIUM_AND_ABOVE'
              }
            ]
          }

          // Add tools if search is enabled
          if (enableSearch) {
            newPayload.tools = [{
              function_declarations: [{
                name: 'search_web',
                description: 'Search the web for information',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The search query'
                    }
                  },
                  required: ['query']
                }
              }]
            }]
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
