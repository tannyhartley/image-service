import { describe, expect, it, vi } from 'vitest';
import { buildImageUrl, ImageServiceClient, ImageServiceError } from '../src/index.js';

const SOURCE = 'https://cdn.example.com/cat.png?v=2';

describe('buildImageUrl', () => {
  it('encodes the source URL and orders parameters consistently', () => {
    const url = buildImageUrl('https://img.example.com', SOURCE, {
      quality: 80,
      format: 'webp',
      width: 300,
    });
    expect(url).toBe(
      'https://img.example.com/process?url=https%3A%2F%2Fcdn.example.com%2Fcat.png%3Fv%3D2&width=300&format=webp&quality=80',
    );
  });

  it('respects a base path', () => {
    expect(buildImageUrl('https://example.com/images/', SOURCE)).toMatch(
      /^https:\/\/example\.com\/images\/process\?url=/,
    );
  });

  it('omits unset values', () => {
    const url = buildImageUrl('https://img.example.com', SOURCE, { width: undefined });
    expect(new URL(url).searchParams.has('width')).toBe(false);
  });
});

function respond(body: BodyInit | null, init: ResponseInit) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(body, init));
}

describe('ImageServiceClient', () => {
  it('returns the image along with its metadata', async () => {
    const fetchMock = respond(new Uint8Array([1, 2, 3]), {
      headers: {
        'content-type': 'image/webp',
        'x-image-width': '300',
        'x-image-height': '200',
        'x-image-format': 'webp',
        'x-cache': 'HIT',
        'x-request-id': 'req-1',
      },
    });
    const client = new ImageServiceClient({ baseUrl: 'https://img.example.com', fetch: fetchMock });

    const image = await client.process(SOURCE, { width: 300, format: 'webp' });

    expect(image).toMatchObject({
      width: 300,
      height: 200,
      format: 'webp',
      bytes: 3,
      cache: 'HIT',
      requestId: 'req-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(image.url, expect.anything());
  });

  it('turns API errors into ImageServiceError', async () => {
    const fetchMock = respond(
      JSON.stringify({
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'One or more query parameters are invalid.',
          details: [{ param: 'width', message: 'Must be a whole number.' }],
        },
        requestId: 'req-2',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
    const client = new ImageServiceClient({ baseUrl: 'https://img.example.com', fetch: fetchMock });

    const error = await client.process(SOURCE).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ImageServiceError);
    expect(error).toMatchObject({
      status: 400,
      code: 'INVALID_PARAMETERS',
      requestId: 'req-2',
      details: [{ param: 'width', message: 'Must be a whole number.' }],
      retryable: false,
    });
  });

  it('exposes retry hints for rate limiting', async () => {
    const fetchMock = respond(
      JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }),
      { status: 429, headers: { 'retry-after': '12' } },
    );
    const client = new ImageServiceClient({ baseUrl: 'https://img.example.com', fetch: fetchMock });

    const error = (await client.metadata(SOURCE).catch((e: unknown) => e)) as ImageServiceError;
    expect(error.retryable).toBe(true);
    expect(error.retryAfter).toBe(12);
  });

  it('handles non-JSON error responses', async () => {
    const fetchMock = respond('<html>Bad Gateway</html>', { status: 502 });
    const client = new ImageServiceClient({ baseUrl: 'https://img.example.com', fetch: fetchMock });

    const error = await client.process(SOURCE).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: 'UNEXPECTED_RESPONSE' });
  });

  it('wraps network failures', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new ImageServiceClient({ baseUrl: 'https://img.example.com', fetch: fetchMock });

    const error = await client.process(SOURCE).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR', retryable: true });
  });

  it('lets aborts propagate untouched', async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException('Aborted', 'AbortError');
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(abortError);
    const client = new ImageServiceClient({ baseUrl: 'https://img.example.com', fetch: fetchMock });

    await expect(client.process(SOURCE, {}, { signal: controller.signal })).rejects.toBe(
      abortError,
    );
  });
});
