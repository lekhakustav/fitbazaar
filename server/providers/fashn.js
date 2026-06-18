import { toDataUrl } from "./shared.js";

const API_BASE = "https://api.fashn.ai/v1";

function statusMessage(status) {
  if (status === "starting" || status === "in_queue") return "Queued with AI try-on provider";
  if (status === "processing") return "Generating realistic try-on";
  return "Waiting for try-on result";
}

export function createFashnProvider({ apiKey, modelName = "tryon-v1.6", timeoutMs = 180000 }) {
  return {
    name: `FASHN ${modelName}`,
    isConfigured() {
      return Boolean(apiKey);
    },
    async generate({ garmentImagePath, modelImagePath, product, signal, onProgress }) {
      if (!apiKey) {
        const error = new Error("FASHN_API_KEY is not configured.");
        error.code = "PROVIDER_NOT_CONFIGURED";
        throw error;
      }

      onProgress?.(18, "Encoding garment and model images");
      const [garmentImage, modelImage] = await Promise.all([
        toDataUrl(garmentImagePath, "image/webp"),
        toDataUrl(modelImagePath),
      ]);

      onProgress?.(28, `Submitting to FASHN ${modelName}`);
      const inputs =
        modelName === "tryon-max"
          ? {
              model_image: modelImage,
              product_image: garmentImage,
              category: product.category ?? "auto",
              mode: "quality",
              num_samples: 1,
            }
          : {
              model_image: modelImage,
              garment_image: garmentImage,
              category: product.category ?? "auto",
              mode: "quality",
              garment_photo_type: "auto",
              num_samples: 1,
            };

      const runResponse = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_name: modelName,
          inputs,
        }),
        signal,
      });

      if (!runResponse.ok) {
        const body = await runResponse.text();
        throw new Error(`FASHN submission failed (${runResponse.status}): ${body.slice(0, 280)}`);
      }

      const run = await runResponse.json();
      const predictionId = run.id ?? run.prediction_id;
      if (!predictionId) {
        throw new Error("FASHN did not return a prediction id.");
      }

      const started = Date.now();
      let progress = 34;
      while (Date.now() - started < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 1400));
        const statusResponse = await fetch(`${API_BASE}/status/${predictionId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal,
        });

        if (!statusResponse.ok) {
          const body = await statusResponse.text();
          throw new Error(`FASHN status failed (${statusResponse.status}): ${body.slice(0, 280)}`);
        }

        const status = await statusResponse.json();
        progress = Math.min(92, progress + 7);
        onProgress?.(progress, statusMessage(status.status));

        if (["completed", "succeeded"].includes(status.status)) {
          const output = Array.isArray(status.output) ? status.output[0] : status.output ?? status.result?.[0];
          return {
            output,
            providerJobId: predictionId,
            rawStatus: status.status,
          };
        }

        if (["failed", "canceled", "cancelled"].includes(status.status)) {
          throw new Error(status.error ?? "FASHN generation failed.");
        }
      }

      throw new Error("FASHN generation timed out.");
    },
  };
}
