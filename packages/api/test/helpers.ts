import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { type Config, loadConfig } from '../src/config.js';
import { errors } from '../src/errors.js';
import type { SourceFetcher } from '../src/fetch/fetcher.js';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({ LOG_LEVEL: 'silent', ...overrides });
}

export async function solidImage(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'webp' | 'gif' = 'png',
  options: { alpha?: boolean } = {},
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: options.alpha ? 4 : 3,
      background: options.alpha ? { r: 200, g: 40, b: 40, alpha: 0.5 } : { r: 30, g: 120, b: 200 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

/** A fetcher backed by an in-memory map of URL -> body, counting calls. */
export function fakeFetcher(files: Record<string, Buffer>) {
  const calls: string[] = [];
  const fetchSource: SourceFetcher = async (url) => {
    calls.push(url.href);
    const buffer = files[url.href];
    if (!buffer) throw errors.sourceHttpError(404);
    return { buffer, url: url.href };
  };
  return { fetchSource, calls };
}

export async function testApp(files: Record<string, Buffer>, env: Record<string, string> = {}) {
  const fetcher = fakeFetcher(files);
  const app = await buildApp({
    config: testConfig(env),
    fetchSource: fetcher.fetchSource,
    logger: false,
  });
  return { app, calls: fetcher.calls };
}

export const query = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
