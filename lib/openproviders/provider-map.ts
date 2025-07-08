import type { Provider, SupportedModel } from "./types"

// map each model ID to its provider
const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  // Google
  "gemini-1.5-flash-latest": "google",
  "gemini-1.5-pro-latest": "google",
  "gemini-pro": "google",
}

// Function to check if a model is likely an Ollama model based on naming patterns
function isOllamaModel(modelId: string): boolean {
  // Common Ollama model patterns
  const ollamaPatterns = [
    /^llama/i,
    /^qwen/i,
    /^deepseek/i,
    /^mistral:/i,
    /^codellama/i,
    /^phi/i,
    /^gemma/i,
    /^codegemma/i,
    /^starcoder/i,
    /^wizardcoder/i,
    /^solar/i,
    /^yi/i,
    /^openchat/i,
    /^vicuna/i,
    /^orca/i,
    /:latest$/i,
    /:[\d.]+[bB]?$/i, // version tags like :7b, :13b, :1.5
  ]

  return ollamaPatterns.some((pattern) => pattern.test(modelId))
}

export function getProviderForModel(model: SupportedModel): Provider {
  if (model.startsWith("openrouter:")) {
    return "openrouter"
  }

  // First check the static mapping
  const provider = MODEL_PROVIDER_MAP[model]
  if (provider) return provider

  // If not found in static mapping, check if it looks like an Ollama model
  if (isOllamaModel(model)) {
    return "ollama"
  }

  throw new Error(`Unknown provider for model: ${model}`)
}
