export interface ErrorDetail {
  param: string;
  message: string;
}

/**
 * An error that is safe to show to API callers. Anything else that reaches the
 * error handler is treated as a bug and reported as a generic 500.
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const formatBytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export const errors = {
  invalidParameters: (details: ErrorDetail[]) =>
    new ApiError(400, 'INVALID_PARAMETERS', 'One or more query parameters are invalid.', details),

  urlNotAllowed: (reason: string) => new ApiError(400, 'URL_NOT_ALLOWED', reason),

  sourceUnreachable: (reason: string) =>
    new ApiError(502, 'SOURCE_UNREACHABLE', `Could not fetch the source image: ${reason}.`),

  sourceTimeout: (timeoutMs: number) =>
    new ApiError(
      504,
      'SOURCE_TIMEOUT',
      `The source image did not finish downloading within ${timeoutMs / 1000}s.`,
    ),

  sourceHttpError: (status: number) =>
    new ApiError(502, 'SOURCE_HTTP_ERROR', `The source URL responded with HTTP ${status}.`),

  tooManyRedirects: (max: number) =>
    new ApiError(502, 'TOO_MANY_REDIRECTS', `The source URL redirected more than ${max} times.`),

  sourceTooLarge: (maxBytes: number) =>
    new ApiError(
      422,
      'SOURCE_TOO_LARGE',
      `The source image is larger than the ${formatBytes(maxBytes)} limit.`,
    ),

  unsupportedSource: (detail: string) =>
    new ApiError(
      422,
      'UNSUPPORTED_SOURCE',
      `The source is not a supported image (${detail}). Supported inputs: JPEG, PNG, WebP, AVIF, GIF, TIFF.`,
    ),

  sourceDimensionsTooLarge: (maxPixels: number) =>
    new ApiError(
      422,
      'SOURCE_DIMENSIONS_TOO_LARGE',
      `The source image exceeds the ${(maxPixels / 1_000_000).toFixed(0)} megapixel limit.`,
    ),

  outputTooLarge: (width: number, height: number, max: number) =>
    new ApiError(
      422,
      'OUTPUT_TOO_LARGE',
      `The requested resize would produce a ${width}x${height} image; each side must be at most ${max}px. Set both width and height, or use smaller values.`,
    ),

  processingFailed: () =>
    new ApiError(422, 'PROCESSING_FAILED', 'The image could not be processed. It may be corrupt.'),

  serverBusy: () =>
    new ApiError(503, 'SERVER_BUSY', 'The server is at capacity. Retry shortly.', undefined, {
      'retry-after': '2',
    }),

  rateLimited: (retryAfterSeconds: number) =>
    new ApiError(429, 'RATE_LIMITED', `Too many requests. Retry in ${retryAfterSeconds}s.`),

  notFound: (method: string, path: string) =>
    new ApiError(404, 'NOT_FOUND', `No route for ${method} ${path}.`),
};
