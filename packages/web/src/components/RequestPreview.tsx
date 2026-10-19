import { curlCommand } from '../format';
import { CopyButton } from './CopyButton';

export function RequestPreview({ url, format }: { url: string | null; format?: string }) {
  if (!url) {
    return (
      <section className="card request">
        <h2>Request</h2>
        <p className="muted">The API request will appear here once you enter a source URL.</p>
      </section>
    );
  }

  const curl = curlCommand(url, format || 'img');

  return (
    <section className="card request">
      <h2>Request</h2>
      <div className="request__row">
        <code className="request__code">
          <span className="request__method">GET</span> {url}
        </code>
        <CopyButton text={url} label="Copy URL" />
      </div>
      <div className="request__row">
        <code className="request__code">{curl}</code>
        <CopyButton text={curl} label="Copy curl" />
      </div>
    </section>
  );
}
