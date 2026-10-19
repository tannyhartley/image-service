import { ImageServiceClient } from '@image-service/client';

// The UI talks to the public API like any other consumer. By default that's the
// origin it's served from; VITE_API_BASE_URL points it somewhere else.
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;

export const client = new ImageServiceClient({ baseUrl: apiBaseUrl });
