import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Heart,
  ImagePlus,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  Ruler,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  UserRound,
  WandSparkles,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { generationRules } from "./aiStrategy";
import { bodyTypes, categories, heightRanges, products } from "./data";
import type { Product } from "./data";

type Preview = {
  id: string;
  height: string;
  body: string;
  status: "ready" | "locked";
};

type TryOnStatus = "idle" | "validating" | "ready" | "generating" | "complete" | "error";

type UploadState = {
  status: TryOnStatus;
  message: string;
  progress: number;
};

type TryOnJob = {
  id?: string;
  jobId?: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  progress: number;
  message: string;
  resultUrl?: string | null;
  error?: string | null;
  cached?: boolean;
  provider?: string;
};

const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}`;

function getSizeAdvice(height: number, weight: number, bodyType: string, product: Product) {
  const bmiLike = weight / Math.max((height / 100) ** 2, 1);
  const bodyAdjustment = bodyType === "Plus Size" || bodyType === "Curvy" ? 1 : 0;
  const baseIndex = bmiLike < 20 ? 0 : bmiLike < 24 ? 1 : bmiLike < 28 ? 2 : 3;
  const bestIndex = Math.min(baseIndex + bodyAdjustment, product.sizes.length - 1);
  const recommended = product.sizes[bestIndex] ?? product.sizes[0] ?? "M";
  const alternative = product.sizes[Math.min(bestIndex + 1, product.sizes.length - 1)] ?? recommended;
  const lengthPenalty = product.length === "long" && height < 155 ? 8 : 0;
  const cropPenalty = product.length === "short" && height > 175 ? 6 : 0;
  const confidence = Math.max(68, Math.min(product.confidence, product.confidence - lengthPenalty - cropPenalty));
  const fitScore = Math.max(64, Math.min(96, product.fitScore - lengthPenalty - cropPenalty));

  return {
    recommended,
    alternative,
    confidence: Math.round(confidence),
    fitScore: Math.round(fitScore),
  };
}

function ProductCard({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`product-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="product-photo">
        <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
      </div>
      <div className="product-copy">
        <div>
          <h3>{product.name}</h3>
          <p>{product.color} - {product.fabric}</p>
        </div>
        <div className="card-meta">
          <strong>{formatPrice(product.price)}</strong>
          <span>
            <Star size={14} fill="currentColor" /> {product.rating}
          </span>
        </div>
      </div>
    </button>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(products[0].id);
  const [heightRange, setHeightRange] = useState(heightRanges[2]);
  const [bodyType, setBodyType] = useState(bodyTypes[1]);
  const [height, setHeight] = useState(164);
  const [weight, setWeight] = useState(58);
  const [fitBody, setFitBody] = useState("Average");
  const [modelImage, setModelImage] = useState("");
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState("");
  const [tryOnProvider, setTryOnProvider] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    message: "Upload a front-facing full-body model photo to generate a personal try-on.",
    progress: 0,
  });
  const [previews, setPreviews] = useState<Preview[]>([
    { id: "default", height: "160-170 cm", body: "Average", status: "ready" },
  ]);
  const [activePreviewId, setActivePreviewId] = useState("default");
  const [unlocked, setUnlocked] = useState(false);

  const selectedProduct = products.find((product) => product.id === selectedId) ?? products[0];
  const selectedPreview = previews.find((preview) => preview.id === activePreviewId) ?? previews[0];
  const fit = getSizeAdvice(height, weight, fitBody, selectedProduct);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const search = `${product.name} ${product.category} ${product.color} ${product.tags.join(" ")}`.toLowerCase();
      return (category === "All" || product.category === category) && search.includes(query.toLowerCase());
    });
  }, [category, query]);

  const similarProducts = useMemo(() => {
    return products
      .filter((product) => product.id !== selectedProduct.id && product.category === selectedProduct.category)
      .slice(0, 4);
  }, [selectedProduct]);

  const customPreviewCount = previews.length - 1;
  const previewLimitReached = customPreviewCount >= 2 && !unlocked;
  const canGenerate = Boolean(modelFile) && uploadState.status !== "generating" && !previewLimitReached && previews.length < 7;

  function selectProduct(product: Product) {
    setSelectedId(product.id);
    setPreviews([{ id: "default", height: "160-170 cm", body: "Average", status: "ready" }]);
    setActivePreviewId("default");
    setUnlocked(false);
    setGeneratedImage("");
    if (uploadState.status === "complete") {
      setUploadState({
        status: "ready",
        message: "Model is ready. Generate a fresh try-on for the selected product.",
        progress: 0,
      });
    }
  }

  function validateAndLoadModel(file: File) {
    setUploadState({ status: "validating", message: "Checking photo quality...", progress: 18 });

    if (!file.type.startsWith("image/")) {
      setUploadState({ status: "error", message: "Please upload a JPG, PNG, or WebP image.", progress: 0 });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadState({ status: "error", message: "Image is too large. Please use a photo under 8 MB.", progress: 0 });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      if (image.width < 420 || image.height < 560) {
        URL.revokeObjectURL(objectUrl);
        setUploadState({
          status: "error",
          message: "Photo is too small. Upload a clearer full-body image with better resolution.",
          progress: 0,
        });
        return;
      }

      const isWide = image.width > image.height * 1.25;
      if (modelImage) URL.revokeObjectURL(modelImage);
      setModelImage(objectUrl);
      setModelFile(file);
      setGeneratedImage("");
      setUploadState({
        status: "ready",
        message: isWide
          ? "Model loaded. A portrait full-body photo will produce a cleaner try-on."
          : "Model loaded. Ready for high-quality AI try-on.",
        progress: 100,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setUploadState({ status: "error", message: "Could not read this image. Try another model photo.", progress: 0 });
    };

    image.src = objectUrl;
  }

  async function readJob(jobId: string) {
    const response = await fetch(`/api/tryon/jobs/${jobId}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Could not read try-on job status.");
    }
    return response.json() as Promise<TryOnJob>;
  }

  async function generatePreview() {
    if (!modelFile) {
      setUploadState({
        status: "error",
        message: "Upload a model photo before running AI try-on.",
        progress: 0,
      });
      return;
    }

    if (previewLimitReached) return;

    const id = `${heightRange}-${bodyType}`;
    const existing = previews.find((preview) => preview.id === id);
    if (existing && generatedImage) {
      setActivePreviewId(existing.id);
      return;
    }

    try {
      setGeneratedImage("");
      setUploadState({ status: "generating", message: "Uploading garment and model to try-on backend...", progress: 10 });

      const formData = new FormData();
      formData.append("productId", selectedProduct.id);
      formData.append("heightRange", heightRange);
      formData.append("bodyType", bodyType);
      formData.append("modelImage", modelFile);

      const response = await fetch("/api/tryon/jobs", {
        method: "POST",
        body: formData,
      });
      const job = (await response.json().catch(() => ({}))) as TryOnJob & { error?: string | null };
      if (!response.ok) {
        throw new Error(job.error ?? "Could not start AI try-on generation.");
      }

      let current = job;
      if (current.status === "succeeded" && current.resultUrl) {
        setGeneratedImage(current.resultUrl);
        setTryOnProvider(current.provider ?? "");
      } else {
        const jobId = current.jobId ?? current.id;
        if (!jobId) throw new Error("Try-on backend did not return a job id.");

        while (!["succeeded", "failed"].includes(current.status)) {
          setUploadState({
            status: "generating",
            message: current.message,
            progress: current.progress,
          });
          await new Promise((resolve) => setTimeout(resolve, 1200));
          current = await readJob(jobId);
        }

        if (current.status === "failed") {
          throw new Error(current.error ?? "AI try-on failed. Please retry with a clearer full-body photo.");
        }

        if (!current.resultUrl) {
          throw new Error("AI try-on finished without a result image.");
        }

        setGeneratedImage(current.resultUrl);
        setTryOnProvider(current.provider ?? "");
      }

      const nextPreview = { id, height: heightRange, body: bodyType, status: "ready" as const };
      setPreviews((currentPreviews) => (currentPreviews.some((preview) => preview.id === id) ? currentPreviews : [...currentPreviews, nextPreview]));
      setActivePreviewId(id);
      setUploadState({
        status: "complete",
        message: current.cached
          ? "Cached real AI try-on loaded for this product/model combination."
          : "Real AI try-on generated and cached for this product/model combination.",
        progress: 100,
      });
    } catch (error) {
      setUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "AI try-on failed. Please retry.",
        progress: 0,
      });
    }
  }

  const galleryBodies = ["Default", "Slim", "Average", "Curvy", "Plus Size"];

  return (
    <main className="app">
      <header className="topbar">
        <button className="brand" aria-label="FitBazaar home">
          <span>FB</span>
          <strong>FitBazaar</strong>
        </button>
        <label className="searchbox">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search jackets, hoodies, dresses"
          />
        </label>
        <nav>
          <button>New</button>
          <button>Stores</button>
          <button>Try-on</button>
        </nav>
        <div className="top-actions">
          <button aria-label="Wishlist">
            <Heart size={18} />
          </button>
          <button aria-label="Cart">
            <ShoppingBag size={18} />
          </button>
          <button aria-label="Account">
            <UserRound size={18} />
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <h1>{selectedProduct.name}</h1>
          <p>Open any product and instantly see the garment source, default AI fit preview, size advice, and body variation controls.</p>
          <div className="trust-row">
            <span>
              <ShieldCheck size={16} /> Private model photos
            </span>
            <span>
              <BadgeCheck size={16} /> Color-preserving AI
            </span>
            <span>
              <Zap size={16} /> Cached previews
            </span>
          </div>
        </div>
        <button className="primary">
          <Camera size={17} /> Seller upload
        </button>
      </section>

      <section className="launch-grid">
        <aside className="sidebar">
          <div className="panel category-panel">
            <div className="section-title">
              <h2>Browse</h2>
              <SlidersHorizontal size={18} />
            </div>
            <div className="category-list">
              {categories.map((item) => (
                <button
                  key={item}
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>

          <div className="panel model-panel">
            <div className="section-title">
              <h2>Try-On Upload</h2>
              <Camera size={18} />
            </div>
            <p>Use one clear, front-facing full-body model photo. We validate before generation.</p>
            <label className={modelImage ? "file-button active" : "file-button"}>
              {uploadState.status === "validating" ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}
              {modelImage ? "Model selected" : "Choose model photo"}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) validateAndLoadModel(file);
                }}
              />
            </label>
            <div className={`status-line ${uploadState.status}`}>
              {uploadState.status === "error" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              <span>{uploadState.message}</span>
            </div>
          </div>

          <div className="panel ai-policy">
            <div className="section-title">
              <h2>Generation Rules</h2>
              <Sparkles size={18} />
            </div>
            {generationRules.map((rule) => (
              <span key={rule}>{rule}</span>
            ))}
          </div>
        </aside>

        <section className="product-main">
          <article className="detail-card">
            <div className="image-stage">
              <img src={selectedProduct.image} alt={selectedProduct.name} decoding="async" />
              <div className="image-label">
                <span>Cleaned catalog source</span>
                <strong>No brightness/color edits</strong>
              </div>
            </div>
            <div className="detail-content">
              <div className="seller-line">
                <span>{selectedProduct.seller}</span>
                <strong>{formatPrice(selectedProduct.price)}</strong>
              </div>
              <h2>{selectedProduct.name}</h2>
              <p>{selectedProduct.fitNote}</p>
              <div className="tag-row">
                {selectedProduct.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="sizes">
                {selectedProduct.sizes.map((size) => (
                  <button key={size}>{size}</button>
                ))}
              </div>
              <div className="metrics-grid">
                <Metric icon={<Sparkles size={17} />} label="AI Fit Score" value={`${fit.fitScore}%`} />
                <Metric icon={<Ruler size={17} />} label="Recommended" value={fit.recommended} />
                <Metric icon={<CheckCircle2 size={17} />} label="Confidence" value={`${fit.confidence}%`} />
              </div>
            </div>
          </article>

          <div className="product-grid">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                selected={product.id === selectedProduct.id}
                onSelect={() => selectProduct(product)}
              />
            ))}
          </div>
        </section>

        <aside className="fit-panel">
          <section className="panel preview-panel">
            <div className="section-title">
              <h2>AI Fit Preview</h2>
              <span>{previews.length}/7 cached</span>
            </div>
            <div className={`ai-preview-card ${uploadState.status}`}>
              <div className="preview-media garment-media">
                <span>Garment source</span>
                <img src={selectedProduct.image} alt={`${selectedProduct.name} source`} />
              </div>
              <div className="preview-media model-media">
                {generatedImage ? (
                  <img src={generatedImage} alt="AI generated virtual try-on result" />
                ) : modelImage ? (
                  <img src={modelImage} alt="Uploaded model" />
                ) : (
                  <div className="empty-model">
                    <ImagePlus size={28} />
                    <strong>Default body preview</strong>
                    <p>Upload a model photo for personal try-on generation.</p>
                  </div>
                )}
                <div className="preview-badge">
                  <strong>{selectedPreview.body}</strong>
                  <span>{tryOnProvider || selectedPreview.height}</span>
                </div>
              </div>
            </div>

            {(uploadState.status === "generating" || uploadState.status === "error") && (
              <div className="progress-wrap">
                <div style={{ width: `${uploadState.status === "error" ? 100 : uploadState.progress}%` }} />
                <span>{uploadState.message}</span>
              </div>
            )}

            <div className="preview-gallery">
              {galleryBodies.map((body) => {
                const isDefault = body === "Default";
                const generated = isDefault || previews.some((preview) => preview.body === body);
                return (
                  <button
                    key={body}
                    className={generated ? "ready" : "locked"}
                    onClick={() => {
                      const found = previews.find((preview) => preview.body === body);
                      if (found) setActivePreviewId(found.id);
                    }}
                  >
                    {generated ? <CheckCircle2 size={15} /> : <LockKeyhole size={15} />}
                    {body}
                  </button>
                );
              })}
            </div>

            <div className="control-grid">
              <label>
                Height range
                <select value={heightRange} onChange={(event) => setHeightRange(event.target.value)}>
                  {heightRanges.map((range) => (
                    <option key={range}>{range}</option>
                  ))}
                </select>
              </label>
              <label>
                Body type
                <select value={bodyType} onChange={(event) => setBodyType(event.target.value)}>
                  {bodyTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="preview-actions">
              <button className="primary" disabled={!canGenerate} onClick={generatePreview}>
                {uploadState.status === "generating" ? <Loader2 size={18} className="spin" /> : <WandSparkles size={18} />}
                {uploadState.status === "error" && modelFile ? "Retry generation" : modelImage ? "Generate real try-on" : "Upload model first"}
              </button>
              {previewLimitReached ? (
                <button className="ghost" onClick={() => setUnlocked(true)}>
                  <LockKeyhole size={17} /> Unlock more
                </button>
              ) : (
                <span>{Math.max(0, 2 - customPreviewCount)} starter previews left</span>
              )}
            </div>
          </section>

          <section className="panel size-card">
            <div className="section-title">
              <h2>Smart Size</h2>
              <Clock3 size={18} />
            </div>
            <div className="measurement-row">
              <label>
                Height
                <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
              </label>
              <label>
                Weight
                <input type="number" value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
              </label>
              <label>
                Body
                <select value={fitBody} onChange={(event) => setFitBody(event.target.value)}>
                  {bodyTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="recommendation">
              <div>
                <span>Recommended</span>
                <strong>{fit.recommended}</strong>
              </div>
              <div>
                <span>Alternative</span>
                <strong>{fit.alternative}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{fit.confidence}%</strong>
              </div>
            </div>
            <div className="warning-list">
              {selectedProduct.warnings.map((warning) => (
                <p key={warning}>
                  <AlertTriangle size={14} /> {warning}
                </p>
              ))}
            </div>
          </section>

          <section className="panel style-card">
            <div className="section-title">
              <h2>Style Suggestions</h2>
              <RefreshCcw size={18} />
            </div>
            <div className="suggestion-list">
              {selectedProduct.styleSuggestions.map((suggestion) => (
                <span key={suggestion}>{suggestion}</span>
              ))}
            </div>
          </section>

          <section className="panel similar-card">
            <div className="section-title">
              <h2>Similar</h2>
              <ChevronRight size={18} />
            </div>
            <div className="similar-list">
              {(similarProducts.length ? similarProducts : products.slice(0, 3)).map((product) => (
                <button key={product.id} onClick={() => selectProduct(product)}>
                  <img src={product.image} alt="" loading="lazy" />
                  <span>{product.name}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

export default App;
