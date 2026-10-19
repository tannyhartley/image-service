import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FetchConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { createSourceFetcher } from '../src/fetch/fetcher.js';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    switch (req.url) {
      case '/ok':
        res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.alloc(100, 1));
        return;
      case '/declared-too-big':
        res.writeHead(200, { 'content-length': '5000' }).end(Buffer.alloc(5000));
        return;
      case '/chunked-too-big':
        // No content-length: the limit has to be enforced while streaming.
        res.writeHead(200);
        res.write(Buffer.alloc(600));
        res.end(Buffer.alloc(600));
        return;
      case '/redirect':
        res.writeHead(302, { location: '/ok' }).end();
        return;
      case '/loop':
        res.writeHead(302, { location: '/loop' }).end();
        return;
      case '/slow':
        res.writeHead(200);
        res.write('a'); // then never finish
        return;
      default:
        res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const baseConfig = (): FetchConfig => ({
  timeoutMs: 500,
  maxBytes: 1000,
  maxRedirects: 2,
  allowedPorts: [port],
  allowPrivateNetworks: true,
});

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

const at = (path: string, host = '127.0.0.1') => new URL(`http://${host}:${port}${path}`);

describe('createSourceFetcher', () => {
  it('downloads the body', async () => {
    const result = await createSourceFetcher(baseConfig())(at('/ok'));
    expect(result.buffer).toHaveLength(100);
  });

  it('follows redirects and reports the final URL', async () => {
    const result = await createSourceFetcher(baseConfig())(at('/redirect'));
    expect(result.url).toBe(at('/ok').href);
  });

  it('gives up after too many redirects', async () => {
    const err = await failure(createSourceFetcher(baseConfig())(at('/loop')));
    expect(err.code).toBe('TOO_MANY_REDIRECTS');
  });

  it('rejects bodies over the limit using content-length', async () => {
    const err = await failure(createSourceFetcher(baseConfig())(at('/declared-too-big')));
    expect(err.code).toBe('SOURCE_TOO_LARGE');
  });

  it('rejects bodies over the limit while streaming', async () => {
    const err = await failure(createSourceFetcher(baseConfig())(at('/chunked-too-big')));
    expect(err.code).toBe('SOURCE_TOO_LARGE');
  });

  it('times out slow sources', async () => {
    const err = await failure(createSourceFetcher(baseConfig())(at('/slow')));
    expect(err.code).toBe('SOURCE_TIMEOUT');
    expect(err.statusCode).toBe(504);
  });

  it('maps upstream errors', async () => {
    const err = await failure(createSourceFetcher(baseConfig())(at('/missing')));
    expect(err.code).toBe('SOURCE_HTTP_ERROR');
    expect(err.message).toContain('404');
  });

  it('maps DNS failures', async () => {
    const err = await failure(
      createSourceFetcher(baseConfig())(new URL(`http://does-not-exist.invalid:${port}/`)),
    );
    expect(err.code).toBe('SOURCE_UNREACHABLE');
  });

  it('blocks hostnames that resolve to private addresses at connect time', async () => {
    const fetchSource = createSourceFetcher({ ...baseConfig(), allowPrivateNetworks: false });
    const err = await failure(fetchSource(at('/ok', 'localhost')));
    expect(err.code).toBe('URL_NOT_ALLOWED');
  });
});
