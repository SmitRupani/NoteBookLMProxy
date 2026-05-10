export const OPENROUTER_EMBED_MODEL =
  process.env.OPENROUTER_EMBED_MODEL || "openai/text-embedding-3-small";
export const OPENROUTER_CHAT_MODEL =
  process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4o-mini";
export const OPENROUTER_EMBED_DIMENSION = 1536;
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const getOpenRouterApiKey = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not defined in environment variables");
  }

  return apiKey;
};
