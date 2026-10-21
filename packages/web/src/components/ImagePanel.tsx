import type { ImageServiceError } from '@image-service/client';
import type { ReactNode } from 'react';
import { ErrorNotice } from './ErrorNotice';

interface Stat {
  label: string;
  value: ReactNode;
}

interface Props {
  tag: string;
  title: string;
  loading: boolean;
  error?: ImageServiceError;
  src?: string;
  stats?: Stat[];
  empty: string;
}

export function ImagePanel({ tag, title, loading, error, src, stats, empty }: Props) {
  let body: ReactNode;
  if (error) {
    body = <ErrorNotice error={error} />;
  } else if (src) {
    body = <img src={src} alt={title} />;
  } else if (!loading) {
    body = <p className="frame__empty">{empty}</p>;
  }

  return (
    <section className="frame" aria-busy={loading}>
      <header className="frame__caption">
        <span className="frame__tag" aria-hidden="true">
          {tag}
        </span>
        <h2>{title}</h2>
        {loading && <span className="spinner" aria-label="Loading" />}
      </header>
      <div
        className={`frame__body${error ? ' frame__body--error' : ''}${loading ? ' frame__body--loading' : ''}`}
      >
        {body}
      </div>
      {stats && !error && (
        <dl className="frame__stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
