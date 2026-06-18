import { createFashnProvider } from "./fashn.js";
import { createReplicateProvider } from "./replicate.js";

export function createTryOnProvider(env) {
  const timeoutMs = Number(env.TRYON_TIMEOUT_MS ?? 180000);
  const provider = (env.TRYON_PROVIDER ?? "fashn").toLowerCase();

  if (provider === "replicate") {
    return createReplicateProvider({
      token: env.REPLICATE_API_TOKEN,
      version: env.REPLICATE_MODEL_VERSION,
      timeoutMs,
    });
  }

  return createFashnProvider({
    apiKey: env.FASHN_API_KEY,
    modelName: env.FASHN_MODEL_NAME ?? "tryon-v1.6",
    timeoutMs,
  });
}
