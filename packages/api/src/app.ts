import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import type { Config } from './config.js';
import { ApiError, errors } from './errors.js';
import { createSourceFetcher, type SourceFetcher } from './fetch/fetcher.js';
import { ImageService } from './image-service.js';
import { imageRoutes } from './routes/images.js';

export interface AppOptions {
  config: Config;
  /** Overridable so tests can serve fixtures without network access. */
  fetchSource?: SourceFetcher;
  logger?: FastifyServerOptions['logger'];
}

const REQUEST_ID = /^[\w-]{1,64}$/;

const EXPOSED_HEADERS = [
  'x-request-id',
  'x-cache',
  'x-image-width',
  'x-image-height',
  'x-image-format',
  'content-length',
  'retry-after',
];

export async function buildApp({ config, fetchSource, logger }: AppOptions) {
  const app = Fastify({
    logger: logger ?? { level: config.logLevel },
    trustProxy: config.trustProxy,
    // Honour an incoming request ID so logs can be correlated across services.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
  });

  const service = new ImageService(config, fetchSource ?? createSourceFetcher(config.fetch));

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
  });

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'HEAD'],
    exposedHeaders: EXPOSED_HEADERS,
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    errorResponseBuilder: (_request, context) => errors.rateLimited(Math.ceil(context.ttl / 1000)),
  });

  app.setErrorHandler((error: FastifyError | ApiError, request, reply) => {
    const apiError = toApiError(error);
    if (apiError.statusCode >= 500 && !(error instanceof ApiError)) {
      request.log.error({ err: error }, 'unhandled error');
    } else {
      request.log.info({ code: apiError.code, status: apiError.statusCode }, apiError.message);
    }

    reply.header('cache-control', 'no-store');
    if (apiError.headers) reply.headers(apiError.headers);
    return reply.code(apiError.statusCode).send({
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
      requestId: request.id,
    });
  });

  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (request) => {
    throw errors.notFound(request.method, request.url.split('?')[0] ?? '/');
  });

  app.get('/healthz', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    ...service.stats,
  }));

  imageRoutes(app, service, config);

  if (config.webDistDir && existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
  } else {
    app.get('/', async () => ({
      name: 'image-service',
      endpoints: ['GET /process', 'GET /metadata', 'GET /healthz'],
    }));
  }

  return app;
}

function toApiError(error: FastifyError | ApiError): ApiError {
  if (error instanceof ApiError) return error;
  const status = error.statusCode ?? 500;
  if (status < 500) {
    return new ApiError(status, error.code ?? 'BAD_REQUEST', error.message);
  }
  return new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on our side.');
}
