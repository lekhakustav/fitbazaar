# AI Try-On Production Strategy

## Recommendation

Use FASHN as the first production provider for the MVP, defaulting to `tryon-v1.6` for customer preview clicks and reserving `tryon-max` for paid/premium catalog assets.

Why:

- It is commercially usable and API-first.
- It accepts a model image plus a garment image, matching the product flow.
- It has async run/status endpoints, so the app can show progress instead of freezing.
- It supports flat-lay and on-model garment references, which fits thrift-store seller photos.
- It gives a predictable credit-based cost instead of GPU infrastructure work on day one.

For this app:

- `TRYON_PROVIDER=fashn`
- `FASHN_MODEL_NAME=tryon-v1.6` for low-cost MVP previews.
- `FASHN_MODEL_NAME=tryon-max` when quality matters more than cost.

## Provider Comparison

| Option | Realism | Commercial readiness | Cost shape | MVP fit |
| --- | --- | --- | --- | --- |
| FASHN `tryon-v1.6` | Strong | High | About one low-cost API generation | Best default |
| FASHN `tryon-max` | Highest | High | 4 credits/image, slower | Premium/admin mode |
| Replicate IDM-VTON | Strong | Weak for business | GPU seconds | Avoid for commercial MVP |
| CatVTON self-host | Good and efficient | License must be checked before revenue | GPU hosting | Later, if licensing works |
| StableVITON self-host | Good research quality | More preprocessing and ops | GPU hosting | Not first choice |
| Kolors Virtual Try-On | Good demo quality | Less clear API/productization | Varies by wrapper | Test only |
| fal.ai FASHN wrapper | Strong | High | About $0.075/generation for v1.5 | Good alternative route |

## Cost Planning

FASHN API credits:

- Public app top-ups list $0.10/credit. API credits start from $7.50 and can get cheaper with volume/commitments.
- `tryon-max` costs 2-5 credits/image depending on resolution and generation mode, so budget about $0.20-$0.50/image at $0.10/credit.
- `tryon-v1.6` is the practical customer-preview default when a low per-click cost matters.

Simple monthly planning:

- 1,000 `tryon-v1.6` previews/month at roughly 1 credit = about $100.
- 5,000 previews/month = about $500.
- 10,000 previews/month = about $1,000.
- The same usage with `tryon-max` can be roughly $200-$5,000 depending on 2-5 credits/output and volume discounts.

Control costs with:

- Cache every generated product/model/body/height result.
- Limit anonymous users to 1-2 previews.
- Use `tryon-v1.6` for browsing and `tryon-max` only for checkout/premium/seller assets.
- Do not auto-generate on product hover or scroll.

## Open-Source Path

CatVTON is the most interesting later-stage self-host candidate because it is designed for simplified inference and reports less than 8 GB VRAM at 1024x768. A small GPU server can work technically, but licensing and operations need review before using it commercially.

IDM-VTON and many popular research VTON models are non-commercial, so they are not safe for a revenue MVP unless a separate commercial license is obtained.

Self-hosting strategy after traction:

- Start with a managed GPU endpoint on RunPod, Modal, Replicate deployment, or a similar provider.
- Target one warm L40S/A40-class GPU for acceptable queue times.
- Store only cached generated outputs and delete uploads after each job.
- Add a queue and webhook callback if requests exceed a single server.

Expected speed:

- API provider: usually tens of seconds, with no GPU ops burden.
- Self-hosted CatVTON: depends on GPU, resolution, batching, and preprocessing, but plan for 10-45 seconds per image until benchmarked.

## Current Implementation

The app now has:

- `server/index.js` API server.
- Provider abstraction in `server/providers`.
- FASHN and Replicate provider adapters.
- Upload validation for model photos.
- Catalog garment lookup from product id.
- Input hashing and image-result caching.
- Async job creation plus polling.
- Clean missing-key and provider-error handling.
- Frontend retry and progress states.

The frontend no longer generates fake timer-based try-on previews. Missing provider credentials now return a real error.
