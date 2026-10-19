import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { isNotModified, setCacheHeaders } from '../http-cache.js';
import type { ImageService } from '../image-service.js';
import { MIME_TYPES } from '../image/formats.js';
import { metadataQuerySchema, parseQuery, processQuerySchema } from '../params.js';

export function imageRoutes(app: FastifyInstance, service: ImageService, config: Config) {
  const processSchema = processQuerySchema(config.image.maxOutputDimension);
  const maxAge = config.cache.httpMaxAgeSeconds;

  app.get('/process', async (request, reply) => {
    const { url, ...options } = parseQuery(processSchema, request.query);
    const { image, cache } = await service.process(url, options);

    setCacheHeaders(reply, maxAge, image.etag);
    reply.header('x-cache', cache);
    reply.header('x-image-width', image.width);
    reply.header('x-image-height', image.height);
    reply.header('x-image-format', image.format);

    if (isNotModified(request, image.etag)) return reply.code(304).send();

    return reply
      .type(MIME_TYPES[image.format])
      .header('content-disposition', `inline; filename="image.${image.format}"`)
      .send(image.data);
  });

  app.get('/metadata', async (request, reply) => {
    const { url } = parseQuery(metadataQuerySchema, request.query);
    const { info } = await service.getSource(url);

    setCacheHeaders(reply, maxAge);
    return {
      url: url.href,
      format: info.format,
      width: info.width,
      height: info.height,
      bytes: info.bytes,
      hasAlpha: info.hasAlpha,
      animated: info.animated,
    };
  });
}
