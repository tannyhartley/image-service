import { errorFromResponse, ImageServiceError } from './errors.js';
import type { OutputFormat, ProcessedImage, SourceMetadata, Transformations } from './types.js';

export interface ClientOptions {
  /** Base URL of the service, e.g. https://images.example.com */
  baseUrl: string;
  /** Custom fetch implementation, mainly for tests or non-browser runtimes. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

// Fixed order keeps generated URLs stable, which matters for CDN cache hits.
const PARAM_ORDER = ['width', 'height', 'crop', 'format', 'quality'] as const;

/**
 * Builds a /process URL. Pure and synchronous, so it can be used directly in
 * <img src> without going through the client.
 */
export function buildImageUrl(
  baseUrl: string,
  sourceUrl: string,
  transformations: Transformations = {},
): string {
  const url = new URL('process', withTrailingSlash(baseUrl));
  url.searchParams.set('url', sourceUrl);
  for (const key of PARAM_ORDER) {
    const value = transformations[key];
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export class ImageServiceClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = withTrailingSlash(options.baseUrl);
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  imageUrl(sourceUrl: string, transformations?: Transformations): string {
    return buildImageUrl(this.baseUrl, sourceUrl, transformations);
  }

  async process(
    sourceUrl: string,
    transformations?: Transformations,
    options: RequestOptions = {},
  ): Promise<ProcessedImage> {
    const url = this.imageUrl(sourceUrl, transformations);
    const response = await this.request(url, options);
    const blob = await response.blob();
    const headers = response.headers;

    return {
      blob,
      url,
      width: Number(headers.get('x-image-width')),
      height: Number(headers.get('x-image-height')),
      format: (headers.get('x-image-format') ?? blob.type.replace('image/', '')) as OutputFormat,
      bytes: blob.size,
      cache: (headers.get('x-cache') as ProcessedImage['cache']) ?? undefined,
      requestId: headers.get('x-request-id') ?? undefined,
    };
  }

  async metadata(sourceUrl: string, options: RequestOptions = {}): Promise<SourceMetadata> {
    const url = new URL('metadata', this.baseUrl);
    url.searchParams.set('url', sourceUrl);
    const response = await this.request(url.toString(), options);
    return (await response.json()) as SourceMetadata;
  }

  private async request(url: string, { signal }: RequestOptions): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal });
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new ImageServiceError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Could not reach the image service.',
        cause,
      });
    }
    if (!response.ok) throw await errorFromResponse(response);
    return response;
  }
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
