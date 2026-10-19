import type { ImageServiceError } from '@image-service/client';
import type { ReactNode } from 'react';
import { ErrorNotice } from './ErrorNotice';

interface Stat {
  label: string;
  value: ReactNode;
}

interface Props {
  title: string;
  loading: boolean;
  error?: ImageServiceError;
  src?: string;
  stats?: Stat[];
  empty: string;
}

export function ImagePanel({ title, loading, error, src, stats, empty }: Props) {
  let body: ReactNode;
  if (error) {
    body = <ErrorNotice error={error} />;
  } else if (src) {
    body = (
      <div className="panel__image">
        <img src={src} alt={title} />
      </div>
    );
  } else if (!loading) {
    body = <p className="panel__empty muted">{empty}</p>;
  }

  return (
    <section className="card panel" aria-busy={loading}>
      <header className="panel__header">
        <h2>{title}</h2>
        {loading && <span className="spinner" aria-label="Loading" />}
      </header>
      <div className={loading ? 'panel__body panel__body--loading' : 'panel__body'}>
        {body ?? <div className="panel__placeholder" />}
      </div>
      {stats && !error && (
        <dl className="stats">
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
