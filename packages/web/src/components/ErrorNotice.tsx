import type { ImageServiceError } from '@image-service/client';

export function ErrorNotice({ error }: { error: ImageServiceError }) {
  return (
    <div className="error" role="alert">
      <div className="error__title">
        <span className="badge badge--error">{error.status || 'Network'}</span>
        <code>{error.code}</code>
      </div>
      <p>{error.message}</p>
      {error.details.length > 0 && (
        <ul className="error__details">
          {error.details.map((detail) => (
            <li key={detail.param}>
              <code>{detail.param}</code>: {detail.message}
            </li>
          ))}
        </ul>
      )}
      {(error.retryAfter || error.requestId) && (
        <p className="error__meta">
          {error.retryAfter ? `Retry after ${error.retryAfter}s. ` : ''}
          {error.requestId ? `Request ID: ${error.requestId}` : ''}
        </p>
      )}
    </div>
  );
}
