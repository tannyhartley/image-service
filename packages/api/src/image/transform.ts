import sharp from 'sharp';
import type { FitEnum, Metadata } from 'sharp';
import type { ImageLimits } from '../config.js';
import { errors } from '../errors.js';
import {
  type CropMode,
  defaultOutputFormat,
  LOSSY_FORMATS,
  type OutputFormat,
  SOURCE_FORMATS,
  type SourceFormat,
} from './formats.js';
import { computeOutputSize } from './output-size.js';

export interface SourceInfo {
  format: SourceFormat;
  /** Display dimensions, i.e. after applying EXIF orientation. */
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
  animated: boolean;
}

export interface TransformOptions {
  width?: number;
  height?: number;
  format?: OutputFormat;
  quality?: number;
  crop: CropMode;
}

export interface TransformResult {
  data: Buffer;
  format: OutputFormat;
  width: number;
  height: number;
}

const SHARP_FIT: Record<CropMode, keyof FitEnum> = {
  fit: 'inside',
  fill: 'cover',
  pad: 'contain',
  scale: 'fill',
};

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

export async function inspectImage(buffer: Buffer, limits: ImageLimits): Promise<SourceInfo> {
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  } catch {
    throw errors.unsupportedSource('unrecognised file type');
  }

  const format = normaliseFormat(metadata);
  if (!format) throw errors.unsupportedSource(`got ${metadata.format}`);

  const { width, height } = metadata;
  if (!width || !height) throw errors.unsupportedSource('missing dimensions');
  if (width * height > limits.maxInputPixels) {
    throw errors.sourceDimensionsTooLarge(limits.maxInputPixels);
  }

  // Orientations 5-8 are rotated by 90 degrees, so width and height swap.
  const rotated = (metadata.orientation ?? 1) >= 5;
  return {
    format,
    width: rotated ? height : width,
    height: rotated ? width : height,
    bytes: buffer.length,
    hasAlpha: metadata.hasAlpha ?? false,
    animated: (metadata.pages ?? 1) > 1,
  };
}

function normaliseFormat(metadata: Metadata): SourceFormat | undefined {
  // libvips reports AVIF as "heif"; HEVC-encoded HEIC isn't decodable in the
  // prebuilt sharp binaries, so only AV1 is accepted.
  if (metadata.format === 'heif') return metadata.compression === 'av1' ? 'avif' : undefined;
  return (SOURCE_FORMATS as readonly string[]).includes(metadata.format ?? '')
    ? (metadata.format as SourceFormat)
    : undefined;
}

export async function transformImage(
  buffer: Buffer,
  source: SourceInfo,
  options: TransformOptions,
  limits: ImageLimits,
): Promise<TransformResult> {
  const format = options.format ?? defaultOutputFormat(source.format);
  const size = computeOutputSize(source, options, options.crop);
  const max = limits.maxOutputDimension;
  if (size.width > max || size.height > max) {
    throw errors.outputTooLarge(size.width, size.height, max);
  }

  // Animated sources are flattened to their first frame; see README.
  let pipeline = sharp(buffer, { limitInputPixels: limits.maxInputPixels })
    .timeout({ seconds: limits.processTimeoutSeconds })
    .autoOrient();

  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: SHARP_FIT[options.crop],
      background: format === 'jpeg' ? WHITE : TRANSPARENT,
    });
  }

  // Without this, transparent areas turn black when converting to JPEG.
  if (format === 'jpeg' && source.hasAlpha) {
    pipeline = pipeline.flatten({ background: WHITE });
  }

  const quality = LOSSY_FORMATS.has(format) ? options.quality : undefined;
  pipeline = pipeline.toFormat(format, quality ? { quality } : {});

  try {
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { data, format, width: info.width, height: info.height };
  } catch {
    throw errors.processingFailed();
  }
}
