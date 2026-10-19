import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { computeOutputSize } from '../src/image/output-size.js';
import { JobLimiter } from '../src/lib/job-limiter.js';

describe('computeOutputSize', () => {
  const source = { width: 1200, height: 800 };

  it.each([
    [{ width: 600, height: 600 }, 'fit', { width: 600, height: 400 }],
    [{ width: 600, height: 600 }, 'fill', { width: 600, height: 600 }],
    [{ width: 600, height: 600 }, 'pad', { width: 600, height: 600 }],
    [{ width: 600, height: 100 }, 'scale', { width: 600, height: 100 }],
    [{ width: 300 }, 'fit', { width: 300, height: 200 }],
    [{ height: 400 }, 'fill', { width: 600, height: 400 }],
    [{}, 'fit', { width: 1200, height: 800 }],
    [{ width: 2400, height: 2400 }, 'fit', { width: 2400, height: 1600 }],
  ] as const)('%o with crop=%s gives %o', (target, crop, expected) => {
    expect(computeOutputSize(source, target, crop)).toEqual(expected);
  });

  it('never returns a zero dimension', () => {
    expect(computeOutputSize({ width: 4000, height: 1 }, { width: 10 }, 'fit')).toEqual({
      width: 10,
      height: 1,
    });
  });
});

describe('JobLimiter', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };

  it('runs at most maxConcurrent jobs and queues the rest', async () => {
    const limiter = new JobLimiter(2, 10);
    const gates = [deferred(), deferred(), deferred()];
    const runs = gates.map((gate) => limiter.run(() => gate.promise));

    await Promise.resolve();
    expect(limiter.stats).toEqual({ active: 2, queued: 1 });

    gates[0]!.resolve();
    await runs[0];
    await Promise.resolve();
    expect(limiter.stats).toEqual({ active: 2, queued: 0 });

    gates[1]!.resolve();
    gates[2]!.resolve();
    await Promise.all(runs);
    expect(limiter.stats).toEqual({ active: 0, queued: 0 });
  });

  it('sheds load with a 503 once the queue is full', async () => {
    const limiter = new JobLimiter(1, 1);
    const gate = deferred();
    const running = limiter.run(() => gate.promise);
    const queued = limiter.run(async () => 'queued');

    const rejected = await limiter.run(async () => 'x').catch((e: unknown) => e);
    expect(rejected).toBeInstanceOf(ApiError);
    expect((rejected as ApiError).statusCode).toBe(503);

    gate.resolve();
    await running;
    expect(await queued).toBe('queued');
  });

  it('releases the slot when a job fails', async () => {
    const limiter = new JobLimiter(1, 0);
    await expect(limiter.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(await limiter.run(async () => 'ok')).toBe('ok');
  });
});
