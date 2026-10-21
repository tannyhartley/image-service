import { useEffect, useState } from 'react';
import { apiBaseUrl, client } from './api';
import { Controls } from './components/Controls';
import { ImagePanel } from './components/ImagePanel';
import { RequestPreview } from './components/RequestPreview';
import { formatBytes, formatChange } from './format';
import {
  EMPTY_FORM,
  type FormState,
  readFormFromLocation,
  toTransformations,
  writeFormToLocation,
} from './form';
import { usePlayground } from './usePlayground';

export function App() {
  const [form, setForm] = useState<FormState>(readFormFromLocation);
  const { original, processed, run, reset } = usePlayground();

  const submit = (next: FormState) => {
    setForm(next);
    writeFormToLocation(next);
    run(next.url.trim(), toTransformations(next));
  };

  // Re-run a shared link on first load. Intentionally mount-only.
  useEffect(() => {
    if (form.url) submit(form);
  }, []);

  const clear = () => {
    setForm(EMPTY_FORM);
    writeFormToLocation(EMPTY_FORM);
    reset();
  };

  const trimmedUrl = form.url.trim();
  const requestUrl = trimmedUrl ? client.imageUrl(trimmedUrl, toTransformations(form)) : null;
  const source = original.data;
  const result = processed.data;

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="brand">
          <span className="brand__mark" aria-hidden="true" />
          image-service <span className="brand__sub">/ playground</span>
        </h1>
        <p className="topbar__api">
          API <code>{apiBaseUrl}</code>
        </p>
      </header>

      <p className="lede">
        Resize and convert any public image. The form below <em>is</em> the query string: each field
        sets one parameter, and the page calls the public API like any other client.
      </p>

      <Controls
        form={form}
        loading={original.loading || processed.loading}
        onChange={setForm}
        onSubmit={submit}
        onReset={clear}
      />

      <main className="results">
        <RequestPreview url={requestUrl} format={form.format || source?.format} />

        <div className="frames">
          <ImagePanel
            tag="A"
            title="Original"
            loading={original.loading}
            error={original.error}
            src={source ? source.url : undefined}
            empty="Enter an image URL, or pick one of the samples."
            stats={
              source && [
                { label: 'Dimensions', value: `${source.width} × ${source.height}` },
                { label: 'Format', value: source.format.toUpperCase() },
                { label: 'Size', value: formatBytes(source.bytes) },
              ]
            }
          />
          <ImagePanel
            tag="B"
            title="Processed"
            loading={processed.loading}
            error={processed.error}
            src={result?.objectUrl}
            empty="The processed image will appear here."
            stats={
              result && [
                { label: 'Dimensions', value: `${result.width} × ${result.height}` },
                { label: 'Format', value: result.format.toUpperCase() },
                {
                  label: 'Size',
                  value: (
                    <>
                      {formatBytes(result.bytes)}
                      {source && (
                        <span className="delta"> {formatChange(source.bytes, result.bytes)}</span>
                      )}
                    </>
                  ),
                },
                {
                  label: 'Cache',
                  value: `${result.cache ?? 'n/a'} · ${result.elapsedMs} ms`,
                },
              ]
            }
          />
        </div>
      </main>
    </div>
  );
}
