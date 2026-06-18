export const aiTiers = [
  {
    name: "Production AI try-on",
    provider: "Backend provider adapter: FASHN or Replicate",
    cost: "Per real generation",
    use: "Send catalog garment plus uploaded model photo to a real virtual try-on model",
  },
  {
    name: "Cached outputs",
    provider: "Server image cache by garment, model, height, and body type",
    cost: "Lower after first run",
    use: "Avoid regenerating the same garment/model combination",
  },
];

export const generationRules = [
  "Use cleaned catalog garment file",
  "Send uploaded model photo to backend",
  "Run provider AI, not frontend mock logic",
  "Preserve original brightness and color",
  "Preserve fabric, shape, logo, and texture",
  "Cache generated output by input hash",
  "Keep model photos private",
];
