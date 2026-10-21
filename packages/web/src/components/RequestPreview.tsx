import { Fragment } from 'react';
import { curlCommand } from '../format';
import { CopyButton } from './CopyButton';

/** Splits the URL without decoding it, so what's shown is exactly what's sent. */
function splitUrl(url: string) {
  const parsed = new URL(url);
  const params = parsed.search
    .slice(1)
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq < 0 ? [pair, ''] : [pair.slice(0, eq), pair.slice(eq + 1)];
    });
  return { base: parsed.origin + parsed.pathname, params };
}

export function RequestPreview({ url, format }: { url: string | null; format?: string }) {
  if (!url) {
    return (
      <section className="request" aria-label="API request">
        <h2 className="section-label">Request</h2>
        <p className="request__empty">
          Enter a source URL above and the exact API request will be built here.
        </p>
      </section>
    );
  }

  const curl = curlCommand(url, format || 'img');
  const { base, params } = splitUrl(url);

  return (
    <section className="request" aria-label="API request">
      <div className="request__head">
        <h2 className="section-label">Request</h2>
        <div className="request__actions">
          <CopyButton text={url} label="Copy URL" />
          <CopyButton text={curl} label="Copy curl" />
        </div>
      </div>
      <code className="request__url">
        <span className="tok-method">GET</span> <span className="tok-base">{base}</span>
        {params.map(([key, value], index) => (
          <Fragment key={key}>
            <span className="tok-sep">{index === 0 ? '?' : '&'}</span>
            <span className="tok-key">{key}</span>
            <span className="tok-sep">=</span>
            <span className="tok-value">{value}</span>
          </Fragment>
        ))}
      </code>
      <code className="request__curl">
        <span className="tok-prompt" aria-hidden="true">
          ${' '}
        </span>
        {curl}
      </code>
    </section>
  );
}
