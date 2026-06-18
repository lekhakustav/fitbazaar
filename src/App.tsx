import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Heart,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Upload,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { generationRules } from "./aiStrategy";
import { bodyTypes, categories, heightRanges, products } from "./data";
import type { Product } from "./data";

type TryOnStatus = "idle" | "validating" | "ready" | "generating" | "complete" | "error";
type GalleryView = "front" | "back" | "source" | "ai";
type ModelGender = "female" | "male";

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

function ProductRailCard({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`rail-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <img src={product.image} alt={product.name} loading="eager" decoding="async" />
      <span>{product.name}</span>
      <strong>{formatPrice(product.price)}</strong>
    </button>
  );
}

function SampleTryOn({
  product,
  view,
  gender,
}: {
  product: Product;
  view: GalleryView;
  gender: ModelGender;
}) {
  const back = view === "back";
  const modeLabel = back ? "Back view will render after generation" : "Front AI preview setup";

  return (
    <div className={`sample-tryon ${gender} ${back ? "back" : "front"}`}>
      <div className="preview-copy">
        <div className="sample-label">
          <Sparkles size={14} />
          Polished sample mode
        </div>
        <h2>{modeLabel}</h2>
        <p>
          Real model try-on activates when the FASHN key is added. This preview keeps the seller garment
          color untouched and shows the exact catalog item selected.
        </p>
      </div>

      <div className="garment-display">
        <div className="garment-photo-shell">
          <img src={product.image} alt={`${product.name} catalog preview`} />
        </div>
        <div className="model-reference-card">
          <UserRound size={18} />
          <span>{gender === "female" ? "Women model reference" : "Men model reference"}</span>
          <strong>Ready for AI try-on</strong>
        </div>
        <div className="color-lock-card">
          <ShieldCheck size={18} />
          <span>Color lock enabled</span>
          <strong>{product.color}</strong>
        </div>
      </div>

      <div className="view-chip">{back ? "Back view queued" : "Front preview ready"}</div>
    </div>
  );
}

function ProductMedia({
  product,
  view,
  gender,
  generatedImage,
}: {
  product: Product;
  view: GalleryView;
  gender: ModelGender;
  generatedImage: string;
}) {
  if (view === "source") {
    return (
      <div className="source-stage">
        <img src={product.image} alt={product.name} />
        <div className="media-note">
          <span>Seller garment source</span>
          <strong>Color preserved</strong>
        </div>
      </div>
    );
  }

  if (generatedImage && view === "ai") {
    return (
      <div className="source-stage">
        <img src={generatedImage} alt="Generated AI try-on result" />
        <div className="media-note">
          <span>Generated try-on</span>
          <strong>Cached result</strong>
        </div>
      </div>
    );
  }

  return <SampleTryOn product={product} view={view} gender={gender} />;
}

function App() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(products[0].id);
  const [galleryView, setGalleryView] = useState<GalleryView>("front");
  const [heightRange, setHeightRange] = useState(heightRanges[2]);
  const [bodyType, setBodyType] = useState(bodyTypes[1]);
  const [modelGender, setModelGender] = useState<ModelGender>("female");
  const [height, setHeight] = useState(164);
  const [weight, setWeight] = useState(58);
  const [selectedSize, setSelectedSize] = useState("");
  const [modelImage, setModelImage] = useState("");
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState("");
  const [tryOnProvider, setTryOnProvider] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    message: "Sample AI preview is visible now. Upload a full-body photo when you want a personal try-on.",
    progress: 0,
  });

  const selectedProduct = products.find((product) => product.id === selectedId) ?? products[0];
  const fit = getSizeAdvice(height, weight, bodyType, selectedProduct);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const haystack = `${product.name} ${product.category} ${product.color} ${product.tags.join(" ")}`.toLowerCase();
      return (category === "All" || product.category === category) && haystack.includes(query.toLowerCase());
    });
  }, [category, query]);

  const relatedProducts = useMemo(() => {
    return products
      .filter((product) => product.id !== selectedProduct.id && product.category === selectedProduct.category)
      .concat(products.filter((product) => product.id !== selectedProduct.id && product.category !== selectedProduct.category))
      .slice(0, 6);
  }, [selectedProduct]);

  const canGenerate = uploadState.status !== "generating";

  function selectProduct(product: Product) {
    setSelectedId(product.id);
    setGalleryView("front");
    setGeneratedImage("");
    setTryOnProvider("");
    setSelectedSize("");
    if (uploadState.status === "complete") {
      setUploadState({
        status: "ready",
        message: "Selected garment changed. Generate again for this product, or keep using sample mode.",
        progress: 0,
      });
    }
  }

  function validateAndLoadModel(file: File) {
    setUploadState({ status: "validating", message: "Checking model photo quality...", progress: 18 });

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
      setGalleryView("ai");
      setUploadState({
        status: "ready",
        message: isWide
          ? "Model loaded. A portrait full-body photo will produce a cleaner try-on."
          : "Model loaded. Ready for provider-backed AI try-on.",
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
    setGalleryView("ai");

    if (!modelFile) {
      setUploadState({
        status: "complete",
        message: "Showing polished sample AI preview. Add the FASHN key later for real generated output.",
        progress: 100,
      });
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

      setUploadState({
        status: "complete",
        message: "Real AI try-on generated and cached for this product/model combination.",
        progress: 100,
      });
    } catch (error) {
      setUploadState({
        status: "complete",
        message: `Sample mode active: ${error instanceof Error ? error.message : "AI provider is not ready yet."}`,
        progress: 100,
      });
    }
  }

  const galleryItems: { id: GalleryView; label: string; sub: string }[] = [
    { id: "front", label: "Front View", sub: "AI sample" },
    { id: "back", label: "Back View", sub: "AI sample" },
    { id: "source", label: "Garment", sub: "Seller photo" },
    { id: "ai", label: "Try-On", sub: tryOnProvider || "Sample mode" },
  ];

  return (
    <main className="app">
      <header className="topbar">
        <button className="brand" aria-label="LugaFit home">
          <span>LF</span>
          <strong>LugaFit</strong>
        </button>
        <label className="searchbox">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search thrift jackets, hoodies, dresses in Nepal"
          />
        </label>
        <nav>
          <button>Women</button>
          <button>Men</button>
          <button>Thrift</button>
          <button>AI Try-On</button>
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

      <section className="nepal-strip">
        <span>Kathmandu Valley delivery</span>
        <span>Verified thrift sellers</span>
        <span>AI size advice for Nepali height ranges</span>
      </section>

      <section className="product-page">
        <aside className="thumb-rail" aria-label="Product media">
          {galleryItems.map((item) => (
            <button
              key={item.id}
              className={galleryView === item.id ? "active" : ""}
              onClick={() => setGalleryView(item.id)}
            >
              {item.id === "source" ? (
                <img src={selectedProduct.image} alt="" />
              ) : (
                <span>{item.label.slice(0, 1)}</span>
              )}
              <strong>{item.label}</strong>
              <small>{item.sub}</small>
            </button>
          ))}
        </aside>

        <section className="media-stage" aria-live="polite">
          <ProductMedia
            product={selectedProduct}
            view={galleryView}
            gender={modelGender}
            generatedImage={generatedImage}
          />
          <button className="media-arrow left" onClick={() => setGalleryView("front")} aria-label="Front view">
            <ChevronRight size={22} />
          </button>
          <button className="media-arrow right" onClick={() => setGalleryView("back")} aria-label="Back view">
            <ChevronRight size={22} />
          </button>
        </section>

        <aside className="buy-panel">
          <div className="seller-line">
            <span>{selectedProduct.seller} - Nepal thrift seller</span>
            <strong>
              <Star size={15} fill="currentColor" /> {selectedProduct.rating}
            </strong>
          </div>

          <h1>{selectedProduct.name}</h1>
          <div className="price-line">
            <strong>{formatPrice(selectedProduct.price)}</strong>
            <span>{selectedProduct.sold} shoppers viewed this style</span>
          </div>

          <div className="option-group">
            <div className="option-title">Fit profile</div>
            <div className="segmented">
              <button className={modelGender === "female" ? "active" : ""} onClick={() => setModelGender("female")}>
                Female model
              </button>
              <button className={modelGender === "male" ? "active" : ""} onClick={() => setModelGender("male")}>
                Male model
              </button>
            </div>
          </div>

          <div className="option-group">
            <div className="option-title">Size</div>
            <div className="size-grid">
              {selectedProduct.sizes.map((size) => (
                <button
                  key={size}
                  className={selectedSize === size ? "active" : ""}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-box">
            <div className="ai-heading">
              <Sparkles size={18} />
              <div>
                <strong>AI Try-On Nepal</strong>
                <span>Front/back preview, size advice, dress-type suggestions</span>
              </div>
            </div>

            <div className="control-grid">
              <label>
                Height
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

            <div className="measurement-row">
              <label>
                Height cm
                <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
              </label>
              <label>
                Weight kg
                <input type="number" value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
              </label>
            </div>

            <label className={modelImage ? "file-button active" : "file-button"}>
              {uploadState.status === "validating" ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}
              {modelImage ? "Personal photo selected" : "Upload model photo"}
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

            {uploadState.status === "generating" && (
              <div className="progress-wrap">
                <div style={{ width: `${uploadState.progress}%` }} />
                <span>{uploadState.message}</span>
              </div>
            )}

            <div className="ai-metrics">
              <div>
                <span>AI Fit Score</span>
                <strong>{fit.fitScore}%</strong>
              </div>
              <div>
                <span>Recommended</span>
                <strong>{fit.recommended}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{fit.confidence}%</strong>
              </div>
            </div>

            <button className="tryon-button" disabled={!canGenerate} onClick={generatePreview}>
              {uploadState.status === "generating" ? <Loader2 size={18} className="spin" /> : <WandSparkles size={18} />}
              {modelFile ? "Generate personal try-on" : "View sample AI try-on"}
            </button>
          </div>

          <div className="checkout-row">
            <button className="quantity">- 1 +</button>
            <button className="cart-button">
              <ShoppingBag size={18} /> Add to cart
            </button>
          </div>

          <button className="store-button">Find seller near Kathmandu</button>

          <div className="trust-list">
            <p>
              <ShieldCheck size={16} /> Delivery in Kathmandu, Lalitpur, Bhaktapur
            </p>
            <p>
              <RefreshCcw size={16} /> Easy return request before seller dispatch
            </p>
            <p>
              <BadgeCheck size={16} /> Garment color is not brightened in AI preview
            </p>
          </div>
        </aside>
      </section>

      <section className="info-grid">
        <article>
          <h2>Why AI recommends this</h2>
          <p>{selectedProduct.fitNote}</p>
          <div className="suggestion-list">
            {selectedProduct.styleSuggestions.map((suggestion) => (
              <span key={suggestion}>{suggestion}</span>
            ))}
          </div>
        </article>
        <article>
          <h2>Fit warnings</h2>
          {selectedProduct.warnings.map((warning) => (
            <p key={warning} className="warning">
              <AlertTriangle size={15} /> {warning}
            </p>
          ))}
        </article>
        <article>
          <h2>Generation rules</h2>
          <div className="rule-list">
            {generationRules.map((rule) => (
              <span key={rule}>{rule}</span>
            ))}
          </div>
        </article>
      </section>

      <section className="browse-section">
        <div className="browse-head">
          <div>
            <h2>More from Nepal sellers</h2>
            <p>Tap a product to switch the full try-on page instantly.</p>
          </div>
          <div className="category-tabs">
            {categories.map((item) => (
              <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="rail-grid">
          {(filteredProducts.length ? filteredProducts : relatedProducts).map((product) => (
            <ProductRailCard
              key={product.id}
              product={product}
              selected={product.id === selectedProduct.id}
              onSelect={() => selectProduct(product)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
