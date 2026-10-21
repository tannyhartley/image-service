import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/build-app.js';
import { query, solidImage, testApp, testConfig } from './helpers.js';

const PHOTO = 'https://images.test/photo.jpg';
const LOGO = 'https://images.test/logo.png';
const TALL = 'https://images.test/tall.png';
const PAGE = 'https://images.test/index.html';

let files: Record<string, Buffer>;
let app: Awaited<ReturnType<typeof testApp>>['app'];

beforeAll(async () => {
  files = {
    [PHOTO]: await solidImage(1200, 800, 'jpeg'),
    [LOGO]: await solidImage(400, 400, 'png', { alpha: true }),
    [TALL]: await solidImage(10, 4000, 'png'),
    [PAGE]: Buffer.from('<!doctype html><title>not an image</title>'),
  };
});

afterEach(async () => {
  await app?.close();
});

async function get(path: string, env?: Record<string, string>, headers?: Record<string, string>) {
  ({ app } = await testApp(files, env));
  return app.inject({ method: 'GET', url: path, headers });
}

describe('GET /process', () => {
  it('resizes within the box by default, preserving aspect ratio', async () => {
    const res = await get(`/process?${query({ url: PHOTO, width: 600, height: 600 })}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['x-image-width']).toBe('600');
    expect(res.headers['x-image-height']).toBe('400');

    const meta = await sharp(res.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([600, 400]);
  });

  it('fills the exact box when crop=fill', async () => {
    const res = await get(
      `/process?${query({ url: PHOTO, width: 300, height: 300, crop: 'fill' })}`,
    );
    const meta = await sharp(res.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([300, 300]);
  });

  it('derives the missing dimension from the aspect ratio', async () => {
    const res = await get(`/process?${query({ url: PHOTO, width: 300 })}`);
    expect(res.headers['x-image-height']).toBe('200');
  });

  it('converts formats', async () => {
    const res = await get(`/process?${query({ url: LOGO, format: 'webp' })}`);
    expect(res.headers['content-type']).toBe('image/webp');
    expect((await sharp(res.rawPayload).metadata()).format).toBe('webp');
  });

  it('accepts jpg as an alias for jpeg', async () => {
    const res = await get(`/process?${query({ url: LOGO, format: 'JPG' })}`);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });

  it('flattens transparency onto white when converting to JPEG', async () => {
    const res = await get(`/process?${query({ url: LOGO, format: 'jpeg' })}`);
    const { data } = await sharp(res.rawPayload).raw().toBuffer({ resolveWithObject: true });
    // 50% red over white, not over black.
    expect(data[1]).toBeGreaterThan(100);
  });

  it('applies quality to lossy formats', async () => {
    const photo = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: '#000',
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer();
    const url = 'https://images.test/noise.png';
    files[url] = photo;

    ({ app } = await testApp(files));
    const low = await app.inject(`/process?${query({ url, format: 'jpeg', quality: 20 })}`);
    const high = await app.inject(`/process?${query({ url, format: 'jpeg', quality: 95 })}`);
    expect(low.rawPayload.length).toBeLessThan(high.rawPayload.length);
  });

  it('serves repeat requests from cache and fetches the source once', async () => {
    const { app: instance, calls } = await testApp(files);
    app = instance;
    const path = `/process?${query({ url: PHOTO, width: 100 })}`;

    const first = await app.inject(path);
    const second = await app.inject(path);
    const other = await app.inject(`/process?${query({ url: PHOTO, width: 200 })}`);

    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(other.headers['x-cache']).toBe('MISS');
    expect(calls).toEqual([PHOTO]);
  });

  it('coalesces concurrent identical requests', async () => {
    const { app: instance, calls } = await testApp(files);
    app = instance;
    const path = `/process?${query({ url: PHOTO, width: 150 })}`;
    await Promise.all([app.inject(path), app.inject(path), app.inject(path)]);
    expect(calls).toHaveLength(1);
  });

  it('sets cache headers and honours If-None-Match', async () => {
    const { app: instance } = await testApp(files);
    app = instance;
    const path = `/process?${query({ url: PHOTO, width: 100 })}`;

    const first = await app.inject(path);
    expect(first.headers['cache-control']).toMatch(/public, max-age=\d+/);
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^".+"$/);

    const revalidated = await app.inject({ url: path, headers: { 'if-none-match': etag } });
    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.rawPayload).toHaveLength(0);
  });

  describe('errors', () => {
    it('returns every validation problem at once', async () => {
      const res = await get(
        `/process?${query({ url: PHOTO, width: 'abc', format: 'bmp', widht: 10 })}`,
      );
      expect(res.statusCode).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');

      const body = res.json();
      expect(body.error.code).toBe('INVALID_PARAMETERS');
      expect(body.requestId).toBeTruthy();
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          { param: 'width', message: 'Must be a whole number.' },
          { param: 'format', message: expect.stringContaining('jpeg, png, webp') },
          { param: 'widht', message: 'Unknown parameter.' },
        ]),
      );
    });

    it('requires a url', async () => {
      const res = await get('/process?width=100');
      expect(res.json().error.details).toEqual([
        { param: 'url', message: expect.stringContaining('Required') },
      ]);
    });

    it.each([
      [{ width: 0 }, 'width'],
      [{ width: 100_000 }, 'width'],
      [{ quality: 101 }, 'quality'],
      [{ crop: 'stretch' }, 'crop'],
    ])('rejects out-of-range values %o', async (params, param) => {
      const res = await get(`/process?${query({ url: PHOTO, ...params })}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details[0].param).toBe(param);
    });

    it('rejects repeated parameters', async () => {
      const res = await get(`/process?url=${encodeURIComponent(PHOTO)}&width=1&width=2`);
      expect(res.json().error.details).toEqual([
        { param: 'width', message: 'Must be given exactly once.' },
      ]);
    });

    it('rejects relative or malformed URLs', async () => {
      const res = await get(`/process?${query({ url: '/images/cat.jpg' })}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details[0].param).toBe('url');
    });

    it('refuses private network targets', async () => {
      const res = await get(
        `/process?${query({ url: 'http://169.254.169.254/latest/meta-data' })}`,
      );
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('URL_NOT_ALLOWED');
    });

    it('reports non-image sources', async () => {
      const res = await get(`/process?${query({ url: PAGE })}`);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('UNSUPPORTED_SOURCE');
    });

    it('passes through upstream failures as 502', async () => {
      const res = await get(`/process?${query({ url: 'https://images.test/missing.png' })}`);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('SOURCE_HTTP_ERROR');
    });

    it('rejects resizes that would blow up the other dimension', async () => {
      const res = await get(`/process?${query({ url: TALL, width: 100 })}`);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('OUTPUT_TOO_LARGE');
    });

    it('rejects sources over the pixel limit', async () => {
      const res = await get(`/process?${query({ url: PHOTO })}`, { MAX_INPUT_PIXELS: '1000' });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('SOURCE_DIMENSIONS_TOO_LARGE');
    });

    it('rate limits per client', async () => {
      ({ app } = await testApp(files, { RATE_LIMIT_MAX: '2' }));
      const path = `/process?${query({ url: PHOTO, width: 50 })}`;
      await app.inject(path);
      await app.inject(path);
      const limited = await app.inject(path);

      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
      expect(limited.headers['retry-after']).toBeDefined();
    });

    it('sheds load once the download queue is full', async () => {
      let started!: () => void;
      const fetchStarted = new Promise<void>((resolve) => (started = resolve));
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => (release = resolve));

      app = await buildApp({
        config: testConfig({ MAX_CONCURRENT_FETCHES: '1', MAX_QUEUED_FETCHES: '0' }),
        fetchSource: async (url) => {
          started();
          await blocked;
          return { buffer: files[url.href]!, url: url.href };
        },
        logger: false,
      });

      const slow = app.inject(`/process?${query({ url: PHOTO, width: 50 })}`);
      await fetchStarted;
      const busy = await app.inject(`/process?${query({ url: LOGO, width: 50 })}`);
      expect(busy.statusCode).toBe(503);
      expect(busy.json().error.code).toBe('SERVER_BUSY');
      expect(busy.headers['retry-after']).toBeDefined();

      release();
      expect((await slow).statusCode).toBe(200);
    });
  });
});

describe('GET /metadata', () => {
  it('describes the source image', async () => {
    const res = await get(`/metadata?${query({ url: LOGO })}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      url: LOGO,
      format: 'png',
      width: 400,
      height: 400,
      bytes: files[LOGO]!.length,
      hasAlpha: true,
      animated: false,
    });
  });

  it('uses the same error format', async () => {
    const res = await get('/metadata');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARAMETERS');
  });
});

describe('misc', () => {
  it('exposes a health check that is not rate limited', async () => {
    ({ app } = await testApp(files, { RATE_LIMIT_MAX: '1' }));
    await app.inject('/healthz');
    const res = await app.inject('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('returns JSON 404s', async () => {
    const res = await get('/nope?x=1');
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toEqual({ code: 'NOT_FOUND', message: 'No route for GET /nope.' });
  });

  it('echoes a caller-supplied request id', async () => {
    const res = await get('/healthz', undefined, { 'x-request-id': 'abc-123' });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});
