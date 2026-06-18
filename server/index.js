import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cachedResult, ensureDir, hashFile, hashKey, saveImageFromProvider } from "./cache.js";
import { createTryOnProvider } from "./providers/index.js";
import { normalizeProviderError } from "./providers/shared.js";
import { products } from "./products.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.TRYON_PORT ?? 8787);
const uploadDir = path.resolve(rootDir, process.env.TRYON_UPLOAD_DIR ?? "server/uploads");
const cacheDir = path.resolve(rootDir, process.env.TRYON_CACHE_DIR ?? "server/cache");
const app = express();
const jobs = new Map();
const provider = createTryOnProvider(process.env);

await ensureDir(uploadDir);
await ensureDir(cacheDir);

const upload = multer({
  dest: uploadDir,
  limits: {
    files: 1,
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter(_req, file, cb) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(new Error("Only JPG, PNG, and WebP model photos are supported."));
      return;
    }
    cb(null, true);
  },
});

app.use(express.json());
app.use(
  "/api/tryon/results",
  express.static(cacheDir, {
    immutable: true,
    maxAge: "30d",
    fallthrough: false,
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: provider.name,
    providerConfigured: provider.isConfigured(),
    cacheEnabled: true,
  });
});

app.post("/api/tryon/jobs", upload.single("modelImage"), async (req, res) => {
  try {
    const file = req.file;
    const product = products[req.body.productId];
    if (!product) {
      if (file) await fs.rm(file.path, { force: true });
      res.status(400).json({ error: "Unknown product selected." });
      return;
    }

    if (!file) {
      res.status(400).json({ error: "Upload a full-body model image before generation." });
      return;
    }

    const garmentImagePath = path.resolve(rootDir, product.image);
    const garmentOk = await fs.access(garmentImagePath).then(() => true).catch(() => false);
    if (!garmentOk) {
      await fs.rm(file.path, { force: true });
      res.status(500).json({ error: "Catalog garment image is missing on the server." });
      return;
    }

    const modelHash = await hashFile(file.path);
    const key = hashKey({
      provider: provider.name,
      productId: product.id,
      modelHash,
      bodyType: req.body.bodyType ?? "Average",
      heightRange: req.body.heightRange ?? "160-170 cm",
      v: 1,
    });

    const cached = await cachedResult(cacheDir, key);
    if (cached) {
      await fs.rm(file.path, { force: true });
      res.status(200).json({
        jobId: `cache-${key}`,
        status: "succeeded",
        cached: true,
        progress: 100,
        message: "Loaded cached try-on result.",
        resultUrl: `/api/tryon/results/${cached.fileName}`,
        provider: provider.name,
      });
      return;
    }

    const jobId = hashKey({ key, startedAt: Date.now() }).slice(0, 24);
    const job = {
      id: jobId,
      status: "queued",
      progress: 8,
      message: "Queued real AI try-on job",
      resultUrl: null,
      error: null,
      provider: provider.name,
      cached: false,
    };
    jobs.set(jobId, job);
    res.status(202).json(job);

    queueMicrotask(async () => {
      const resultPath = path.join(cacheDir, `${key}.jpg`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.TRYON_TIMEOUT_MS ?? 180000) + 10000);

      try {
        if (!provider.isConfigured()) {
          const error = new Error(`${provider.name} is not configured. Add the provider API key to .env.`);
          error.code = "PROVIDER_NOT_CONFIGURED";
          throw error;
        }

        job.status = "processing";
        job.progress = 14;
        job.message = "Preparing catalog garment and model photo";

        const result = await provider.generate({
          garmentImagePath,
          modelImagePath: file.path,
          product,
          signal: controller.signal,
          onProgress(progress, message) {
            job.progress = progress;
            job.message = message;
          },
        });

        job.progress = 94;
        job.message = "Caching generated try-on image";
        await saveImageFromProvider(result.output, resultPath);

        job.status = "succeeded";
        job.progress = 100;
        job.message = "Real AI try-on generated and cached.";
        job.resultUrl = `/api/tryon/results/${key}.jpg`;
        job.providerJobId = result.providerJobId;
      } catch (error) {
        job.status = "failed";
        job.progress = 100;
        job.error = normalizeProviderError(error);
        job.message = "AI try-on generation failed.";
      } finally {
        clearTimeout(timeout);
        await fs.rm(file.path, { force: true }).catch(() => {});
      }
    });
  } catch (error) {
    res.status(500).json({ error: normalizeProviderError(error) });
  }
});

app.get("/api/tryon/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Try-on job not found. Please retry generation." });
    return;
  }
  res.json(job);
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: normalizeProviderError(error) });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Try-on backend listening on http://127.0.0.1:${port}`);
  console.log(`Provider: ${provider.name} (${provider.isConfigured() ? "configured" : "missing credentials"})`);
});
