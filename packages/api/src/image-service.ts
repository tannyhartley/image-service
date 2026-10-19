import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import type { Config } from './config.js';
import type { SourceFetcher } from './fetch/fetcher.js';
import { assertFetchableUrl } from './fetch/url-policy.js';
import { JobLimiter } from './lib/job-limiter.js';
import {
  inspectImage,
  type SourceInfo,
  transformImage,
  type TransformOptions,
} from './image/transform.js';
import type { OutputFormat } from './image/formats.js';

export interface Source {
  buffer: Buffer;
  info: SourceInfo;
}

export interface ProcessedImage {
  data: Buffer;
  format: OutputFormat;
  width: number;
  height: number;
  etag: string;
}

export type CacheStatus = 'HIT' | 'MISS';

/**
 * Fetching, decoding and encoding are all expensive, so both the downloaded
 * source and the processed output are cached. LRUCache.fetch() also coalesces
 * concurrent requests for the same key into a single fetch/transform.
 */
export class ImageService {
  private readonly sources: LRUCache<string, Source>;
  private readonly outputs: LRUCache<string, ProcessedImage, TransformOptions & { url: URL }>;
  private readonly limiter: JobLimiter;

  constructor(
    private readonly config: Config,
    private readonly fetchSource: SourceFetcher,
  ) {
    this.limiter = new JobLimiter(config.jobs.maxConcurrent, config.jobs.maxQueued);

    this.sources = new LRUCache({
      maxSize: config.cache.sourceMaxBytes,
      ttl: config.cache.sourceTtlMs,
      sizeCalculation: (source) => source.buffer.length,
      fetchMethod: async (href) => {
        const { buffer } = await this.fetchSource(new URL(href));
        return { buffer, info: await inspectImage(buffer, config.image) };
      },
    });

    this.outputs = new LRUCache({
      maxSize: config.cache.outputMaxBytes,
      ttl: config.cache.outputTtlMs,
      sizeCalculation: (image) => image.data.length,
      fetchMethod: async (_key, _stale, { context }) => {
        const source = await this.getSource(context.url);
        const result = await this.limiter.run(() =>
          transformImage(source.buffer, source.info, context, config.image),
        );
        return {
          ...result,
          etag: `"${createHash('sha1').update(result.data).digest('base64url')}"`,
        };
      },
    });
  }

  async getSource(url: URL): Promise<Source> {
    // Fail fast on obviously bad URLs before touching the cache or network.
    assertFetchableUrl(url, this.config.fetch);
    return (await this.sources.fetch(url.href))!;
  }

  async process(
    url: URL,
    options: TransformOptions,
  ): Promise<{ image: ProcessedImage; cache: CacheStatus }> {
    assertFetchableUrl(url, this.config.fetch);
    const status: LRUCache.Status<string, ProcessedImage> = {};
    const image = await this.outputs.fetch(cacheKey(url, options), {
      context: { ...options, url },
      status,
    });
    return { image: image!, cache: status.fetch === 'hit' ? 'HIT' : 'MISS' };
  }

  get stats() {
    return {
      jobs: this.limiter.stats,
      sourceCache: { entries: this.sources.size, bytes: this.sources.calculatedSize },
      outputCache: { entries: this.outputs.size, bytes: this.outputs.calculatedSize },
    };
  }
}

function cacheKey(url: URL, options: TransformOptions): string {
  const { width, height, format, quality, crop } = options;
  return JSON.stringify([url.href, width, height, format, quality, crop]);
}
