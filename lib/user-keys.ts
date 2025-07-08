import { env } from "./openproviders/env"
import { Provider } from "./openproviders/types"

export type { Provider } from "./openproviders/types"
export type ProviderWithoutOllama = Exclude<Provider, "ollama">

export async function getEffectiveApiKey(
  userId: string | null,
  provider: ProviderWithoutOllama
): Promise<string | null> {
  // Only Google provider is active, so we only need its key.
  if (provider === "google") {
    return env.GOOGLE_GENERATIVE_AI_API_KEY || null
  }
  // Return null for any other case.
  return null
}
