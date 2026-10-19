import type { CropMode } from './formats.js';

export interface Size {
  width: number;
  height: number;
}

/**
 * Predicts the output dimensions so oversized results can be rejected before
 * any pixels are decoded. Setting only `width` on a very tall image would
 * otherwise produce an enormous height.
 */
export function computeOutputSize(
  source: Size,
  target: { width?: number; height?: number },
  crop: CropMode,
): Size {
  const { width, height } = target;

  if (width && height) {
    if (crop !== 'fit') return { width, height };
    const scale = Math.min(width / source.width, height / source.height);
    return {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    };
  }
  if (width) {
    return { width, height: Math.max(1, Math.round((source.height * width) / source.width)) };
  }
  if (height) {
    return { width: Math.max(1, Math.round((source.width * height) / source.height)), height };
  }
  return { ...source };
}
