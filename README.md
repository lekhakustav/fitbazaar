# FitBazaar

Premium AI virtual fashion fitting storefront for Nepal-focused thrift and fashion sellers.

## What Works

- Browse cleaned catalog garment photos.
- Upload a model image from the product page.
- Start a real AI try-on job through the backend.
- Poll generation progress.
- Retry failed generation.
- Cache generated try-on images by product/model/body/height.
- Switch providers later through `TRYON_PROVIDER`.

## Local Run

```bash
npm install
npm run dev:all
```

Frontend:

```text
http://127.0.0.1:5274
```

Backend health:

```text
http://127.0.0.1:8787/api/health
```

## AI Provider Setup

Copy `.env.example` to `.env` and add your provider key.

```env
TRYON_PROVIDER=fashn
FASHN_API_KEY=your_key_here
FASHN_MODEL_NAME=tryon-v1.6
```

Use `tryon-v1.6` for low-cost MVP customer previews. Use `tryon-max` for premium catalog/admin output.

## GitHub Pages

This repo includes `.github/workflows/pages.yml`.

After pushing to GitHub:

1. Open the GitHub repo.
2. Go to Settings -> Pages.
3. Set Source to GitHub Actions if it is not already selected.
4. Wait for the workflow to finish.
5. Share the Pages URL with testers.

Note: GitHub Pages hosts only the frontend. Real AI try-on needs the Node backend deployed separately with `FASHN_API_KEY`.
