export const OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'gif'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * How the image is fitted when both width and height are given. Names follow
 * Cloudinary's crop modes since that's what most callers will know.
 */
export const CROP_MODES = ['fit', 'fill', 'pad', 'scale'] as const;
export type CropMode = (typeof CROP_MODES)[number];

export const SOURCE_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff'] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export const MIME_TYPES: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

/** Formats where `quality` has an effect. PNG and GIF are lossless here. */
export const LOSSY_FORMATS: ReadonlySet<OutputFormat> = new Set(['jpeg', 'webp', 'avif']);

/** When no format is requested, keep the source format where we can encode it. */
export function defaultOutputFormat(source: SourceFormat): OutputFormat {
  return source === 'tiff' ? 'png' : source;
}
