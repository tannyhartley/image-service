import { errors } from '../errors.js';

/**
 * Caps concurrent CPU-heavy work and sheds load once the queue is full.
 * Rejecting with a 503 is better than letting latency grow without bound
 * while every request eventually times out.
 */
export class JobLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {}

  get stats() {
    return { active: this.active, queued: this.waiting.length };
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active < this.maxConcurrent) {
      this.active++;
    } else if (this.waiting.length < this.maxQueued) {
      // The releasing job hands its slot over directly, so `active` is unchanged.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      throw errors.serverBusy();
    }

    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
