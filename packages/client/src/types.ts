export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';

/**
 * How the image fits when both width and height are set.
 * - `fit`: scale down/up to fit inside the box, keeping aspect ratio (default)
 * - `fill`: cover the box exactly, cropping the overflow from the centre
 * - `pad`: fit inside the box, then pad to the exact size
 * - `scale`: stretch to the exact size, ignoring aspect ratio
 */
export type CropMode = 'fit' | 'fill' | 'pad' | 'scale';

export interface Transformations {
  width?: number;
  height?: number;
  format?: OutputFormat;
  /** 1-100. Applies to jpeg, webp and avif; ignored for png and gif. */
  quality?: number;
  crop?: CropMode;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  format: OutputFormat;
  bytes: number;
  /** Whether the server had this exact result cached. */
  cache: 'HIT' | 'MISS' | undefined;
  requestId: string | undefined;
  /** The exact URL that was requested. */
  url: string;
}

export interface SourceMetadata {
  url: string;
  format: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff';
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
  animated: boolean;
}

export interface ErrorDetail {
  param: string;
  message: string;
}

export type ErrorCode =
  | 'INVALID_PARAMETERS'
  | 'URL_NOT_ALLOWED'
  | 'SOURCE_UNREACHABLE'
  | 'SOURCE_TIMEOUT'
  | 'SOURCE_HTTP_ERROR'
  | 'TOO_MANY_REDIRECTS'
  | 'SOURCE_TOO_LARGE'
  | 'UNSUPPORTED_SOURCE'
  | 'SOURCE_DIMENSIONS_TOO_LARGE'
  | 'OUTPUT_TOO_LARGE'
  | 'PROCESSING_FAILED'
  | 'RATE_LIMITED'
  | 'SERVER_BUSY'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  // Raised by the client itself rather than the server.
  | 'NETWORK_ERROR'
  | 'UNEXPECTED_RESPONSE';
