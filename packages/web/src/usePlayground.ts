import {
  ImageServiceError,
  type ProcessedImage,
  type SourceMetadata,
  type Transformations,
} from '@image-service/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { client } from './api';

export interface RequestState<T> {
  loading: boolean;
  data?: T;
  error?: ImageServiceError;
}

export interface ProcessedResult extends ProcessedImage {
  objectUrl: string;
  elapsedMs: number;
}

const IDLE = { loading: false };

function asServiceError(err: unknown): ImageServiceError {
  if (err instanceof ImageServiceError) return err;
  return new ImageServiceError({
    status: 0,
    code: 'UNEXPECTED_RESPONSE',
    message: err instanceof Error ? err.message : 'Something went wrong.',
  });
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * Fetches the source metadata and the processed image in parallel. Starting a
 * new run cancels the previous one so stale responses never overwrite fresh ones.
 */
export function usePlayground() {
  const [original, setOriginal] = useState<RequestState<SourceMetadata>>(IDLE);
  const [processed, setProcessed] = useState<RequestState<ProcessedResult>>(IDLE);
  const inFlight = useRef<AbortController | null>(null);

  const run = useCallback((sourceUrl: string, transformations: Transformations) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;

    // Keep showing the previous result while loading, to avoid layout jumps.
    setOriginal((prev) => ({ loading: true, data: prev.data }));
    setProcessed((prev) => ({ loading: true, data: prev.data }));

    client.metadata(sourceUrl, { signal }).then(
      (data) => setOriginal({ loading: false, data }),
      (err: unknown) =>
        !isAbort(err) && setOriginal({ loading: false, error: asServiceError(err) }),
    );

    const started = performance.now();
    client.process(sourceUrl, transformations, { signal }).then(
      (image) =>
        setProcessed({
          loading: false,
          data: {
            ...image,
            objectUrl: URL.createObjectURL(image.blob),
            elapsedMs: Math.round(performance.now() - started),
          },
        }),
      (err: unknown) =>
        !isAbort(err) && setProcessed({ loading: false, error: asServiceError(err) }),
    );
  }, []);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    setOriginal(IDLE);
    setProcessed(IDLE);
  }, []);

  const objectUrl = processed.data?.objectUrl;
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => () => inFlight.current?.abort(), []);

  return { original, processed, run, reset };
}
