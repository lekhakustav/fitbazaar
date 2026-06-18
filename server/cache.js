import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function hashFile(filePath) {
  const file = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(file).digest("hex");
}

export function hashKey(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export async function cachedResult(cacheDir, key) {
  const fileName = `${key}.jpg`;
  const resultPath = path.join(cacheDir, fileName);
  try {
    await fs.access(resultPath);
    return { fileName, resultPath };
  } catch {
    return null;
  }
}

export async function saveImageFromProvider(output, resultPath) {
  if (!output) {
    throw new Error("Try-on provider returned no image output.");
  }

  if (typeof output === "string" && output.startsWith("data:image/")) {
    const [, payload] = output.split(",");
    await fs.writeFile(resultPath, Buffer.from(payload, "base64"));
    return;
  }

  if (typeof output === "string" && /^https?:\/\//.test(output)) {
    const response = await fetch(output);
    if (!response.ok) {
      throw new Error(`Could not download provider result: ${response.status}`);
    }
    await fs.writeFile(resultPath, Buffer.from(await response.arrayBuffer()));
    return;
  }

  throw new Error("Unsupported try-on provider output format.");
}
