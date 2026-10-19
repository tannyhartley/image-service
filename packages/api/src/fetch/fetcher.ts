import type { Readable } from 'node:stream';
import { Agent, request } from 'undici';
import type { FetchConfig } from '../config.js';
import { ApiError, errors } from '../errors.js';
import { assertFetchableUrl, BlockedAddressError, guardedLookup } from './url-policy.js';

export interface FetchedSource {
  buffer: Buffer;
  /** URL after following redirects. */
  url: string;
}

export type SourceFetcher = (url: URL) => Promise<FetchedSource>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'image-service/0.1 (+https://github.com/)';

export function createSourceFetcher(config: FetchConfig): SourceFetcher {
  const agent = new Agent({
    connect: {
      timeout: config.timeoutMs,
      ...(config.allowPrivateNetworks ? {} : { lookup: guardedLookup }),
    },
    headersTimeout: config.timeoutMs,
    bodyTimeout: config.timeoutMs,
  });

  return async function fetchSource(initialUrl) {
    // One deadline for the whole fetch, redirects and body included, so a
    // slow-drip server can't hold a request open indefinitely.
    const signal = AbortSignal.timeout(config.timeoutMs);
    let url = initialUrl;

    try {
      for (let redirects = 0; ; redirects++) {
        // Re-checked on every hop: a public URL may redirect to a private one.
        assertFetchableUrl(url, config);

        const response = await request(url, {
          dispatcher: agent,
          method: 'GET',
          signal,
          headers: { 'user-agent': USER_AGENT, accept: 'image/*,*/*;q=0.5' },
        });

        if (REDIRECT_STATUSES.has(response.statusCode)) {
          await response.body.dump();
          const location = header(response.headers.location);
          if (!location) throw errors.sourceHttpError(response.statusCode);
          if (redirects >= config.maxRedirects) throw errors.tooManyRedirects(config.maxRedirects);
          url = new URL(location, url);
          continue;
        }

        if (response.statusCode !== 200) {
          await response.body.dump();
          throw errors.sourceHttpError(response.statusCode);
        }

        const declaredLength = Number(header(response.headers['content-length']));
        if (declaredLength > config.maxBytes) {
          discard(response.body);
          throw errors.sourceTooLarge(config.maxBytes);
        }

        const buffer = await readWithLimit(response.body, config.maxBytes);
        return { buffer, url: url.href };
      }
    } catch (err) {
      throw toApiError(err, config.timeoutMs);
    }
  };
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function discard(body: Readable): void {
  // destroy() emits an AbortError; nobody is listening, so swallow it.
  body.on('error', () => {});
  body.destroy();
}

/** Content-Length can be absent or wrong, so the limit is enforced on the stream itself. */
async function readWithLimit(body: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.length;
    // Throwing out of for-await destroys the stream for us.
    if (total > maxBytes) {
      throw errors.sourceTooLarge(maxBytes);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

const TIMEOUT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

const NETWORK_REASONS: Record<string, string> = {
  ENOTFOUND: 'the hostname could not be resolved',
  EAI_AGAIN: 'the hostname could not be resolved',
  ECONNREFUSED: 'the connection was refused',
  ECONNRESET: 'the connection was reset',
  EHOSTUNREACH: 'the host is unreachable',
  ENETUNREACH: 'the network is unreachable',
  UND_ERR_SOCKET: 'the connection closed unexpectedly',
  CERT_HAS_EXPIRED: 'the TLS certificate has expired',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'the TLS certificate is self-signed',
  ERR_TLS_CERT_ALTNAME_INVALID: 'the TLS certificate does not match the hostname',
};

function toApiError(err: unknown, timeoutMs: number): ApiError {
  if (err instanceof ApiError) return err;

  // undici wraps connect-time failures, so look through the cause chain.
  for (let current = err; current instanceof Error; current = current.cause) {
    if (current instanceof BlockedAddressError) {
      return errors.urlNotAllowed(
        'The URL resolves to a private or reserved IP address, which is not allowed.',
      );
    }
    if (current.name === 'TimeoutError' || current.name === 'AbortError') {
      return errors.sourceTimeout(timeoutMs);
    }
    const code = (current as NodeJS.ErrnoException).code;
    if (code && TIMEOUT_CODES.has(code)) return errors.sourceTimeout(timeoutMs);
    if (code && NETWORK_REASONS[code]) return errors.sourceUnreachable(NETWORK_REASONS[code]);
  }

  return errors.sourceUnreachable('the request failed');
}
