import { FREE_MODELS_IDS } from "../config"
import { geminiModels } from "./data/gemini"
import { ModelConfig } from "./types"

const STATIC_MODELS: ModelConfig[] = [...geminiModels]

export async function getAllModels(): Promise<ModelConfig[]> {
  return STATIC_MODELS
}

export async function getModelsWithAccessFlags(): Promise<ModelConfig[]> {
  return STATIC_MODELS.map((m) => ({
    ...m,
    accessible: FREE_MODELS_IDS.includes(m.id),
  }))
}

export async function getModelsForProvider(
  provider: string
): Promise<ModelConfig[]> {
  if (provider === "google") return STATIC_MODELS
  return []
}

export async function getModelsForUserProviders(
  providers: string[]
): Promise<ModelConfig[]> {
  return providers.includes("google") ? STATIC_MODELS : []
}

export function getModelInfo(modelId: string): ModelConfig | undefined {
  return STATIC_MODELS.find((m) => m.id === modelId)
}

export const MODELS: ModelConfig[] = STATIC_MODELS

export function refreshModelsCache(): void {
  // no-op since models are static
}
