export const systemPrompt = `You are a helpful company assistant. Answer clearly and concisely.`

if (process.env.NODE_ENV !== "production" && !systemPrompt.trim()) {
  console.warn("Custom system prompt is empty. Edit lib/custom-system-prompt.ts to set one.")
}

