# Image Service

A Cloudinary-style image processing API with a small web playground. Point it at a public
image URL and it resizes, crops and converts it on the fly:

```
GET /process?url=https://example.com/photo.jpg&width=800&height=600&crop=fill&format=webp
```

Built with TypeScript, Fastify and [sharp](https://sharp.pixelplumbing.com/) (libvips). The
repository is an npm workspace with three packages:

| Package                              | What it is                                                     |
| ------------------------------------ | -------------------------------------------------------------- |
| [`packages/api`](packages/api)       | The HTTP service                                               |
| [`packages/client`](packages/client) | A small typed SDK: builds URLs, turns errors into typed errors |
| [`packages/web`](packages/web)       | React playground that uses the SDK against the public API      |

## Running locally

Requires Node 22+.

```bash
npm ci
npm run dev
```

This starts the API on http://localhost:3000 and the playground on http://localhost:5173.
Vite proxies API calls in development, so the UI calls the API on its own origin just as it
does in production.

To run the production build (API serving the built UI from one process):

```bash
npm run build
WEB_DIST_DIR=packages/web/dist npm start   # http://localhost:3000
```

Or with Docker:

```bash
docker build -t image-service .
docker run --rm -p 8080:8080 image-service   # http://localhost:8080
```

**Testing against local images:** private and loopback addresses are blocked by design (see
[Safeguards](#limits-and-safeguards)). To process images served from your own machine, opt in
explicitly:

```bash
ALLOW_PRIVATE_NETWORKS=true ALLOWED_PORTS=80,443,8000 npm run dev
```

### Tests

```bash
npm test            # API + SDK test suites (vitest)
npm run typecheck
npm run format:check
```

The API tests cover three layers:

- **URL policy:** unit tests for the address and URL rules, including encoding tricks such as
  `http://2130706433/`, IPv4-mapped IPv6 and NAT64.
- **Fetcher:** tests against a real local HTTP server. They cover redirects, redirect loops,
  size limits with and without `Content-Length`, slow-drip timeouts, DNS failures, and
  connect-time blocking of hostnames that resolve to private IPs.
- **HTTP:** end-to-end tests through `app.inject()` with an in-memory source fetcher. They cover
  transformations, caching, coalescing, ETags, every error class and rate limiting.

Test images are generated with sharp at runtime, so there are no binary fixtures in the repo.

## API

### `GET /process`

| Param     | Required | Values                                          | Notes                                                              |
| --------- | -------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `url`     | yes      | absolute `http(s)` URL, ≤ 2048 chars            | URL-encode it                                                      |
| `width`   |          | integer 1–4096                                  | Omit one dimension to keep the aspect ratio                        |
| `height`  |          | integer 1–4096                                  |                                                                    |
| `crop`    |          | `fit` (default), `fill`, `pad`, `scale`         | Only matters when both dimensions are set                          |
| `format`  |          | `jpeg` (or `jpg`), `png`, `webp`, `avif`, `gif` | Defaults to the source format (TIFF becomes PNG)                   |
| `quality` |          | integer 1–100                                   | Applies to `jpeg`, `webp` and `avif`; ignored for lossless formats |

Crop modes follow Cloudinary's names, since that is what most callers will already know:

- `fit` scales the image to fit inside the box and keeps the aspect ratio.
- `fill` covers the box exactly and crops the overflow from the centre.
- `pad` fits the image inside the box, then pads it to the exact size: transparent padding, or
  white for JPEG.
- `scale` stretches the image to the exact size and ignores the aspect ratio.

Other behaviour:

- EXIF orientation is applied.
- Metadata (EXIF, GPS, ICC profile) is stripped from output.
- Transparent areas become white when converting to JPEG, rather than libvips' default of black.

Response headers include `Content-Type`, `ETag`, `Cache-Control`, and `X-Image-Width` /
`X-Image-Height` / `X-Image-Format`. They also include `X-Cache: HIT|MISS` (server-side
cache) and `X-Request-Id`. All of these are exposed to browsers via CORS.

### `GET /metadata?url=…`

Describes the source image without transforming it. The playground uses this for the
"Original" panel.

```json
{
  "url": "https://…",
  "format": "png",
  "width": 800,
  "height": 600,
  "bytes": 226933,
  "hasAlpha": true,
  "animated": false
}
```

### `GET /healthz`

Liveness plus a snapshot of queue depth and cache usage. It is excluded from rate limiting.

### Errors

Every error has the same shape and is sent with `Cache-Control: no-store`:

```json
{
  "error": {
    "code": "INVALID_PARAMETERS",
    "message": "One or more query parameters are invalid.",
    "details": [
      { "param": "width", "message": "Must be a whole number." },
      { "param": "widht", "message": "Unknown parameter." }
    ]
  },
  "requestId": "9b1c…"
}
```

Validation reports every problem at once, not just the first. Unknown parameters are rejected
rather than ignored, so a typo such as `widht` doesn't silently return an unresized image.

| Status | Code                                                                    | Meaning                                                  |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| 400    | `INVALID_PARAMETERS`                                                    | Fix the listed params                                    |
| 400    | `URL_NOT_ALLOWED`                                                       | Scheme, credentials, port, or a private/reserved target  |
| 404    | `NOT_FOUND`                                                             | Unknown route                                            |
| 422    | `UNSUPPORTED_SOURCE`, `SOURCE_TOO_LARGE`, `SOURCE_DIMENSIONS_TOO_LARGE` | The request is fine, but this source can't be processed  |
| 422    | `OUTPUT_TOO_LARGE`, `PROCESSING_FAILED`                                 | The requested output can't be produced                   |
| 429    | `RATE_LIMITED`                                                          | Back off; see `Retry-After`                              |
| 502    | `SOURCE_HTTP_ERROR`, `SOURCE_UNREACHABLE`, `TOO_MANY_REDIRECTS`         | The origin failed; the upstream status is in the message |
| 503    | `SERVER_BUSY`                                                           | Processing queue is full; see `Retry-After`              |
| 504    | `SOURCE_TIMEOUT`                                                        | The origin was too slow                                  |

Status codes split responsibility along these lines:

- **4xx** means the caller can fix the problem.
- **422** means the request was valid but the source image itself is the problem.
- **502/504** mean the origin is at fault.
- **503** means this service is overloaded.

### Client SDK

```ts
import { ImageServiceClient, ImageServiceError } from '@image-service/client';

const images = new ImageServiceClient({ baseUrl: 'https://images.example.com' });

// Pure URL builder; use it directly in <img src>
const src = images.imageUrl(photoUrl, { width: 400, format: 'webp' });

try {
  const result = await images.process(photoUrl, { width: 400, height: 400, crop: 'fill' });
  console.log(result.width, result.height, result.bytes, result.cache);
} catch (err) {
  if (err instanceof ImageServiceError && err.retryable) {
    // RATE_LIMITED, SERVER_BUSY, SOURCE_TIMEOUT, NETWORK_ERROR; see err.retryAfter
  }
}
```

The SDK writes parameters in a fixed order, so equivalent requests produce identical URLs and
share CDN cache entries.

## Architecture

```
request ─▶ rate limit ─▶ validate params (zod) ─▶ output cache ──hit──▶ response
                                                       │ miss
                                                       ▼
                                   source cache ◀── fetch source (SSRF-guarded agent)
                                        │
                                        ▼
                         job limiter ─▶ sharp: orient → resize → flatten → encode
```

- **Fetching** (`src/fetch`): an undici agent whose DNS lookup rejects any non-public address,
  plus static URL checks that run again on every redirect hop.
- **Image** (`src/image`): format detection, output-size prediction and the sharp pipeline. It
  is free of HTTP concerns, so it can be tested in isolation.
- **`ImageService`**: two LRU caches (downloaded sources and processed outputs) and a job
  limiter. `LRUCache.fetch()` coalesces concurrent identical requests, so a burst for the same
  image triggers one download and one transform.
- **HTTP** (`app.ts`, `routes/`): request IDs, CORS, rate limiting, a single error handler, and
  HTTP caching. The source fetcher is injected, which lets the HTTP tests run without a network.

## Limits and safeguards

A service that fetches arbitrary URLs is an open proxy and an SSRF vector by default. These are
the limits I chose and why. Each is configurable through environment variables (see
[`.env.example`](.env.example)).

**Untrusted URLs**

| Safeguard          | Value                         | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schemes            | `http`, `https`               | Rules out `file:`, `gopher:` and similar.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ports              | 80, 443                       | Prevents using the service to probe arbitrary ports (Redis, SSH, admin panels) on public hosts.                                                                                                                                                                                                                                                                                                                                              |
| Credentials in URL | rejected                      | Avoids the service authenticating anywhere on a caller's behalf.                                                                                                                                                                                                                                                                                                                                                                             |
| Private networks   | blocked                       | Only globally routable unicast addresses are allowed. This blocks loopback, RFC 1918, link-local (`169.254.169.254` cloud metadata), CGNAT, multicast, and IPv6 ranges that embed IPv4 (mapped, NAT64, 6to4, Teredo). The check runs **inside the DNS lookup used to open the socket**, so the address we validate is the address we connect to. This closes the DNS-rebinding gap that a "resolve, check, then fetch" approach leaves open. |
| Redirects          | max 3, every hop re-validated | A public URL redirecting to `http://127.0.0.1` is the classic bypass.                                                                                                                                                                                                                                                                                                                                                                        |

**Resource limits**

| Safeguard            | Value                                | Reasoning                                                                                                                                                                                                  |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch timeout        | 8 s total (connect + headers + body) | One deadline covers the whole fetch, so a slow-drip server can't hold a connection open. 8 s is generous for an image, and with processing time it still fits under typical 30 s load-balancer timeouts.   |
| Max source size      | 15 MB                                | Covers large camera JPEGs. Enforced on `Content-Length` and again while streaming, since the header can be missing or wrong.                                                                               |
| Input types          | JPEG, PNG, WebP, AVIF, GIF, TIFF     | Detected from the bytes, not the `Content-Type` header (origins often get it wrong). SVG is deliberately excluded because rendering it is a much larger attack surface (external references, XML parsing). |
| Max input pixels     | 50 MP                                | Decompression-bomb guard: a few-KB PNG can declare 50,000×50,000 pixels. Checked from the header before decoding.                                                                                          |
| Max output dimension | 4096 px per side                     | Enough for retina hero images. The output size is **predicted before processing**, so `width=4000` on a 10×4000 image is rejected up front rather than after trying to render a 4000×1,600,000 result.     |
| Processing timeout   | 10 s (libvips)                       | Upper bound on CPU time per image.                                                                                                                                                                         |

**Abuse and load**

| Safeguard   | Value                          | Reasoning                                                                                                                                                                                                             |
| ----------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limit  | 120 req/min per IP             | Comfortable for a person using the playground (2 requests per run) and for page loads with many images. It stops naive scripted abuse. Set `TRUST_PROXY=true` behind a load balancer so the real client IP is used.   |
| Concurrency | CPU cores, 64 queued, then 503 | Image encoding is CPU-bound. Running more jobs than cores just makes every one slower. Once the queue is full, shedding load with a fast 503 and `Retry-After` beats letting latency grow until everything times out. |

**Caching**

- **Output cache:** in-memory LRU, 256 MB, 1 h TTL. It stores processed images keyed by the
  normalised parameters, so repeated requests skip both the fetch and the transform.
- **Source cache:** in-memory LRU, 128 MB, 5 min TTL. It stores downloaded originals. This
  makes the common "same image, try different settings" pattern cheap, and lets `/metadata` and
  `/process` share one download.
- **HTTP caching:** `Cache-Control: public, max-age=86400, stale-while-revalidate=86400`, plus a
  strong `ETag`. Clients and CDNs can cache results and revalidate with `If-None-Match` (304).
  I didn't mark responses `immutable`, because the image behind a source URL can change.
- **Errors** are `no-store`, so a transient upstream failure isn't cached.

## Deployment

Not deployed. The repository is ready to deploy reproducibly:

- **Docker:** a multi-stage `Dockerfile` produces a single container. The API serves the built
  UI, it runs as a non-root user, and it has a `HEALTHCHECK` against `/healthz`.
- **Configuration:** everything comes from environment variables. There are no secrets in the
  repo, and none are required.
- **CI:** a GitHub Actions workflow runs formatting, typechecks, tests and the build on every
  push and PR, then builds the Docker image.

Any container host works. On Fly.io, for example: `fly launch`, `fly deploy`, and set
`TRUST_PROXY=true`.

## Trade-offs and what I left out

- **Caches are in-process.** Each instance has its own cache and its own rate-limit counters.
  This is fine for one instance, but it doesn't scale horizontally. I picked it for simplicity.
  See next steps for the production setup.
- **No signed URLs.** Anyone can use the service to process any public image. Rate limiting
  bounds the damage, but a real deployment should sign URLs or allowlist source domains.
- **Animated GIF/WebP sources are flattened to their first frame.** Preserving animation
  through resizes is doable with sharp, but it multiplies CPU and memory per request. I'd
  rather add it deliberately, with its own limits.
- **The ETag is a hash of the output.** A conditional request therefore still needs the output,
  but that comes from the cache in the common case.
- **Skipped bonus items:** the video thumbnail endpoint (it would need ffmpeg in the image and a
  separate set of limits) and an OpenAPI spec. Of the bonuses, I chose the typed SDK and CI.
  Basic observability comes partly for free: pino JSON logs with request IDs, and propagation of
  an incoming `X-Request-Id`.

## What I'd do next

1. **Put a CDN in front, and use a shared cache.** A CDN would absorb most traffic, with the
   service acting as its origin. Behind it, a shared cache (S3 for outputs, Redis for rate
   limits) would let instances scale horizontally.
2. **Add signed URLs.** Sign request URLs with HMAC (as Cloudinary and imgproxy do) and/or
   allowlist source domains per tenant. This turns the open proxy into a closed one.
3. **Add metrics.** Track latency histograms per stage (fetch, transform), cache hit rate, queue
   depth, and error rate by code, then alert on queue saturation and upstream error spikes.
4. **Generate an OpenAPI spec.** Derive it from the zod schemas so the docs, validation and SDK
   types can't drift apart.
5. **More transformations:** `format=auto` negotiated from `Accept` (with `Vary: Accept`),
   rotate/blur/grayscale, and animated output.
6. **Run the image work separately.** Isolate libvips in a separate worker pool or sandbox.
   Image decoders are a classic source of memory-safety bugs, and the service decodes untrusted
   input.
