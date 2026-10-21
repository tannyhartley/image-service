import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

const int = (fallback: number, min = 1) => z.coerce.number().int().min(min).default(fallback);

const MB = 1024 * 1024;

const envSchema = z.object({
  PORT: int(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.stringbool().default(false),
  WEB_DIST_DIR: z.string().optional(),

  FETCH_TIMEOUT_MS: int(8_000),
  MAX_SOURCE_BYTES: int(15 * MB),
  MAX_REDIRECTS: int(3, 0),
  ALLOWED_PORTS: z
    .string()
    .default('80,443')
    .transform((value) => value.split(',').map((port) => Number(port.trim())))
    .pipe(z.array(z.number().int().min(1).max(65535)).min(1)),
  // Only for local development against images served from localhost.
  ALLOW_PRIVATE_NETWORKS: z.stringbool().default(false),

  MAX_OUTPUT_DIMENSION: int(4096),
  MAX_INPUT_PIXELS: int(50_000_000),
  PROCESS_TIMEOUT_SECONDS: int(10),

  RATE_LIMIT_MAX: int(120),
  RATE_LIMIT_WINDOW_MS: int(60_000),

  OUTPUT_CACHE_MAX_BYTES: int(128 * MB),
  OUTPUT_CACHE_TTL_MS: int(60 * 60_000),
  SOURCE_CACHE_MAX_BYTES: int(64 * MB),
  SOURCE_CACHE_TTL_MS: int(5 * 60_000),
  HTTP_CACHE_MAX_AGE_SECONDS: int(86_400, 0),

  MAX_CONCURRENT_JOBS: int(availableParallelism()),
  MAX_QUEUED_JOBS: int(64, 0),
  // Each in-flight download buffers up to MAX_SOURCE_BYTES, so this bounds that memory.
  MAX_CONCURRENT_FETCHES: int(8),
  MAX_QUEUED_FETCHES: int(32, 0),
});

export interface FetchConfig {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  allowedPorts: readonly number[];
  allowPrivateNetworks: boolean;
}

export interface ImageLimits {
  maxOutputDimension: number;
  maxInputPixels: number;
  processTimeoutSeconds: number;
}

export interface Config {
  port: number;
  host: string;
  logLevel: string;
  trustProxy: boolean;
  webDistDir?: string;
  fetch: FetchConfig;
  image: ImageLimits;
  rateLimit: { max: number; windowMs: number };
  cache: {
    outputMaxBytes: number;
    outputTtlMs: number;
    sourceMaxBytes: number;
    sourceTtlMs: number;
    httpMaxAgeSeconds: number;
  };
  jobs: { maxConcurrent: number; maxQueued: number };
  fetches: { maxConcurrent: number; maxQueued: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;

  return {
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    // @fastify/static requires an absolute path.
    webDistDir: e.WEB_DIST_DIR && resolve(e.WEB_DIST_DIR),
    fetch: {
      timeoutMs: e.FETCH_TIMEOUT_MS,
      maxBytes: e.MAX_SOURCE_BYTES,
      maxRedirects: e.MAX_REDIRECTS,
      allowedPorts: e.ALLOWED_PORTS,
      allowPrivateNetworks: e.ALLOW_PRIVATE_NETWORKS,
    },
    image: {
      maxOutputDimension: e.MAX_OUTPUT_DIMENSION,
      maxInputPixels: e.MAX_INPUT_PIXELS,
      processTimeoutSeconds: e.PROCESS_TIMEOUT_SECONDS,
    },
    rateLimit: { max: e.RATE_LIMIT_MAX, windowMs: e.RATE_LIMIT_WINDOW_MS },
    cache: {
      outputMaxBytes: e.OUTPUT_CACHE_MAX_BYTES,
      outputTtlMs: e.OUTPUT_CACHE_TTL_MS,
      sourceMaxBytes: e.SOURCE_CACHE_MAX_BYTES,
      sourceTtlMs: e.SOURCE_CACHE_TTL_MS,
      httpMaxAgeSeconds: e.HTTP_CACHE_MAX_AGE_SECONDS,
    },
    jobs: { maxConcurrent: e.MAX_CONCURRENT_JOBS, maxQueued: e.MAX_QUEUED_JOBS },
    fetches: { maxConcurrent: e.MAX_CONCURRENT_FETCHES, maxQueued: e.MAX_QUEUED_FETCHES },
  };
}
