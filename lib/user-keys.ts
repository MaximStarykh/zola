import { env } from "./openproviders/env"
import { Provider } from "./openproviders/types"

export type { Provider } from "./openproviders/types"
export type ProviderWithoutOllama = Exclude<Provider, "ollama">

export async function getEffectiveApiKey(
  _userId: string | null,
  _provider: ProviderWithoutOllama
): Promise<string | null> {
  return env.GEMINI_API_KEY
}
