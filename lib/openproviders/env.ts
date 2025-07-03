export const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
}

export function createEnvWithUserKeys(
  _userKeys: Record<string, string> = {}
): typeof env {
  return {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
  }
}
