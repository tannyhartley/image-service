import type { FastifyReply, FastifyRequest } from 'fastify';

export function setCacheHeaders(reply: FastifyReply, maxAgeSeconds: number, etag?: string): void {
  // The source behind a URL can change, so allow caching for a bounded time
  // rather than marking responses immutable.
  reply.header(
    'cache-control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`,
  );
  if (etag) reply.header('etag', etag);
}

export function isNotModified(request: FastifyRequest, etag: string): boolean {
  const header = request.headers['if-none-match'];
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}
