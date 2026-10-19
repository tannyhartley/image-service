import { z } from 'zod';
import { type ErrorDetail, errors } from './errors.js';
import { CROP_MODES, OUTPUT_FORMATS } from './image/formats.js';

const MAX_URL_LENGTH = 2048;

const sourceUrl = z
  .string({ error: 'Required. Pass the absolute URL of the source image.' })
  .trim()
  .min(1, 'Required. Pass the absolute URL of the source image.')
  .max(MAX_URL_LENGTH, `Must be at most ${MAX_URL_LENGTH} characters.`)
  .transform((value, ctx) => {
    try {
      return new URL(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Must be an absolute URL, e.g. https://example.com/a.jpg.',
      });
      return z.NEVER;
    }
  });

const integer = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, 'Must be a whole number.')
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, `Must be between ${min} and ${max}.`)
        .max(max, `Must be between ${min} and ${max}.`),
    );

const format = z
  .string()
  .transform((value) => value.toLowerCase())
  .transform((value) => (value === 'jpg' ? 'jpeg' : value))
  .pipe(z.enum(OUTPUT_FORMATS, `Must be one of: ${OUTPUT_FORMATS.join(', ')}.`));

const crop = z.enum(CROP_MODES, `Must be one of: ${CROP_MODES.join(', ')}.`);

export function processQuerySchema(maxDimension: number) {
  return z
    .object({
      url: sourceUrl,
      width: integer(1, maxDimension).optional(),
      height: integer(1, maxDimension).optional(),
      format: format.optional(),
      quality: integer(1, 100).optional(),
      crop: crop.default('fit'),
    })
    .strict();
}

export const metadataQuerySchema = z.object({ url: sourceUrl }).strict();

export type ProcessQuery = z.infer<ReturnType<typeof processQuerySchema>>;

export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query);
  if (result.success) return result.data;
  const raw = (query ?? {}) as Record<string, unknown>;
  throw errors.invalidParameters(result.error.issues.flatMap((issue) => toDetails(issue, raw)));
}

function toDetails(issue: z.core.$ZodIssue, query: Record<string, unknown>): ErrorDetail[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({ param: key, message: 'Unknown parameter.' }));
  }
  const param = String(issue.path[0] ?? 'query');
  // Repeated parameters (?width=1&width=2) arrive as arrays.
  if (Array.isArray(query[param])) {
    return [{ param, message: 'Must be given exactly once.' }];
  }
  return [{ param, message: issue.message }];
}
