import fs from "node:fs/promises";
import path from "node:path";

const mimeByExt = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function toDataUrl(filePath, fallbackMime = "image/jpeg") {
  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeByExt[ext] ?? fallbackMime;
  const data = await fs.readFile(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

export function normalizeProviderError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/Token\s+[A-Za-z0-9._-]+/g, "Token [redacted]");
}
