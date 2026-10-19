import type { ErrorCode, ErrorDetail } from './types.js';

export class ImageServiceError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];
  readonly requestId: string | undefined;
  /** Seconds to wait before retrying, when the server says so. */
  readonly retryAfter: number | undefined;

  constructor(init: {
    status: number;
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    requestId?: string;
    retryAfter?: number;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = 'ImageServiceError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
  }

  /** True for failures that may succeed if retried later. */
  get retryable(): boolean {
    return (
      this.code === 'RATE_LIMITED' ||
      this.code === 'SERVER_BUSY' ||
      this.code === 'SOURCE_TIMEOUT' ||
      this.code === 'NETWORK_ERROR'
    );
  }
}

interface ErrorBody {
  error?: { code?: ErrorCode; message?: string; details?: ErrorDetail[] };
  requestId?: string;
}

export async function errorFromResponse(response: Response): Promise<ImageServiceError> {
  const retryAfter = Number(response.headers.get('retry-after')) || undefined;
  const requestId = response.headers.get('x-request-id') ?? undefined;

  let body: ErrorBody | undefined;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // Not our JSON error format, e.g. a proxy's HTML error page.
  }

  if (body?.error?.code && body.error.message) {
    return new ImageServiceError({
      status: response.status,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details,
      requestId: body.requestId ?? requestId,
      retryAfter,
    });
  }

  return new ImageServiceError({
    status: response.status,
    code: 'UNEXPECTED_RESPONSE',
    message: `Unexpected HTTP ${response.status} response from the image service.`,
    requestId,
    retryAfter,
  });
}
