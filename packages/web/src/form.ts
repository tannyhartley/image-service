import type { CropMode, OutputFormat, Transformations } from '@image-service/client';

/**
 * Raw form values. Kept as strings, and deliberately not validated here: the
 * point of the playground is to show how the API itself responds.
 */
export interface FormState {
  url: string;
  width: string;
  height: string;
  format: OutputFormat | '';
  quality: string;
  crop: CropMode;
}

export const EMPTY_FORM: FormState = {
  url: '',
  width: '',
  height: '',
  format: '',
  quality: '',
  crop: 'fit',
};

const FIELDS = ['url', 'width', 'height', 'format', 'quality', 'crop'] as const;

const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));

export function toTransformations(form: FormState): Transformations {
  const hasBothDimensions = Boolean(form.width && form.height);
  return {
    width: optionalNumber(form.width),
    height: optionalNumber(form.height),
    format: form.format || undefined,
    quality: optionalNumber(form.quality),
    // Only send crop when it changes anything, and leave the default implicit.
    crop: hasBothDimensions && form.crop !== 'fit' ? form.crop : undefined,
  };
}

/** Keeps the current request in the address bar so it can be shared or reloaded. */
export function readFormFromLocation(): FormState {
  const params = new URLSearchParams(window.location.search);
  const form = { ...EMPTY_FORM };
  for (const field of FIELDS) {
    const value = params.get(field);
    if (value !== null) (form as Record<string, string>)[field] = value;
  }
  return form;
}

export function writeFormToLocation(form: FormState): void {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    if (form[field] && !(field === 'crop' && form.crop === 'fit')) params.set(field, form[field]);
  }
  const search = params.toString();
  window.history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
}
