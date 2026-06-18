import { toDataUrl } from "./shared.js";

const API_BASE = "https://api.replicate.com/v1";

export function createReplicateProvider({ token, version, timeoutMs = 180000 }) {
  return {
    name: "Replicate Virtual Try-On",
    isConfigured() {
      return Boolean(token && version);
    },
    async generate({ garmentImagePath, modelImagePath, product, signal, onProgress }) {
      if (!token || !version) {
        const error = new Error("REPLICATE_API_TOKEN and REPLICATE_MODEL_VERSION are required.");
        error.code = "PROVIDER_NOT_CONFIGURED";
        throw error;
      }

      onProgress?.(18, "Encoding garment and model images");
      const [garmentImage, modelImage] = await Promise.all([
        toDataUrl(garmentImagePath, "image/webp"),
        toDataUrl(modelImagePath),
      ]);

      onProgress?.(28, "Submitting to Replicate provider");
      const createResponse = await fetch(`${API_BASE}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=1",
        },
        body: JSON.stringify({
          version,
          input: {
            model_image: modelImage,
            garment_image: garmentImage,
            category: product.category ?? "auto",
          },
        }),
        signal,
      });

      if (!createResponse.ok) {
        const body = await createResponse.text();
        throw new Error(`Replicate submission failed (${createResponse.status}): ${body.slice(0, 280)}`);
      }

      let prediction = await createResponse.json();
      const started = Date.now();
      let progress = 34;

      while (Date.now() - started < timeoutMs) {
        if (prediction.status === "succeeded") {
          const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
          return {
            output,
            providerJobId: prediction.id,
            rawStatus: prediction.status,
          };
        }

        if (["failed", "canceled"].includes(prediction.status)) {
          throw new Error(prediction.error ?? "Replicate generation failed.");
        }

        await new Promise((resolve) => setTimeout(resolve, 1400));
        progress = Math.min(92, progress + 7);
        onProgress?.(progress, "Generating realistic try-on");

        const statusResponse = await fetch(`${API_BASE}/predictions/${prediction.id}`, {
          headers: { Authorization: `Token ${token}` },
          signal,
        });
        if (!statusResponse.ok) {
          const body = await statusResponse.text();
          throw new Error(`Replicate status failed (${statusResponse.status}): ${body.slice(0, 280)}`);
        }
        prediction = await statusResponse.json();
      }

      throw new Error("Replicate generation timed out.");
    },
  };
}
