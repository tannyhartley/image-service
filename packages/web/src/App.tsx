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
    <div className="layout">
      <header className="masthead">
        <h1>Image Service Playground</h1>
        <p className="muted">
          Resize and convert any public image. Every request below goes through the public API at{' '}
          <code>{apiBaseUrl}</code>.
        </p>
      </header>

      <Controls
        form={form}
        loading={original.loading || processed.loading}
        onChange={setForm}
        onSubmit={submit}
        onReset={clear}
      />

      <main className="results">
        <RequestPreview url={requestUrl} format={form.format || source?.format} />

        <div className="panels">
          <ImagePanel
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
                        <span className="muted"> ({formatChange(source.bytes, result.bytes)})</span>
                      )}
                    </>
                  ),
                },
                {
                  label: 'Server cache',
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
