import type { CropMode, OutputFormat } from '@image-service/client';
import type { FormEvent } from 'react';
import type { FormState } from '../form';

const SAMPLES = [
  { label: 'JPEG photo (redirects)', url: 'https://picsum.photos/id/1015/1600/1000' },
  {
    label: 'PNG with transparency',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
  },
  { label: 'Not an image', url: 'https://example.com/' },
  { label: 'Private address', url: 'http://169.254.169.254/latest/meta-data/' },
];

const FORMATS: Array<{ value: OutputFormat | ''; label: string }> = [
  { value: '', label: 'original' },
  { value: 'jpeg', label: 'jpeg' },
  { value: 'png', label: 'png' },
  { value: 'webp', label: 'webp' },
  { value: 'avif', label: 'avif' },
  { value: 'gif', label: 'gif' },
];

const CROP_MODES: Array<{ value: CropMode; hint: string }> = [
  { value: 'fit', hint: 'Fit inside the box, keeping the aspect ratio.' },
  { value: 'fill', hint: 'Cover the box exactly, cropping the overflow.' },
  { value: 'pad', hint: 'Fit inside the box, then pad to the exact size.' },
  { value: 'scale', hint: 'Stretch to the exact size, ignoring aspect ratio.' },
];

interface Props {
  form: FormState;
  loading: boolean;
  onChange: (form: FormState) => void;
  onSubmit: (form: FormState) => void;
  onReset: () => void;
}

/**
 * Each field is labelled with the query parameter it sets, so the form reads
 * like the request it builds.
 */
export function Controls({ form, loading, onChange, onSubmit, onReset }: Props) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    onChange({ ...form, [key]: value });

  const cropEnabled = Boolean(form.width && form.height);
  const qualityEnabled = form.format !== 'png' && form.format !== 'gif';
  const cropHint = CROP_MODES.find((mode) => mode.value === form.crop)?.hint;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    // noValidate: let the API report invalid input, so its errors are visible.
    <form className="composer" onSubmit={submit} noValidate>
      <div className="composer__source">
        <span className="composer__verb" aria-hidden="true">
          GET /process?
        </span>
        <label className="param param--url" htmlFor="url">
          <span className="param__key">url=</span>
          <input
            id="url"
            type="url"
            placeholder="https://example.com/photo.jpg"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="composer__params">
        <label className="param" htmlFor="width">
          <span className="param__key">width=</span>
          <input
            id="width"
            type="number"
            min={1}
            placeholder="auto"
            value={form.width}
            onChange={(e) => set('width', e.target.value)}
          />
        </label>
        <label className="param" htmlFor="height">
          <span className="param__key">height=</span>
          <input
            id="height"
            type="number"
            min={1}
            placeholder="auto"
            value={form.height}
            onChange={(e) => set('height', e.target.value)}
          />
        </label>
        <label className="param" htmlFor="crop" data-disabled={!cropEnabled || undefined}>
          <span className="param__key">crop=</span>
          <select
            id="crop"
            value={form.crop}
            disabled={!cropEnabled}
            onChange={(e) => set('crop', e.target.value as CropMode)}
          >
            {CROP_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.value}
              </option>
            ))}
          </select>
        </label>
        <label className="param" htmlFor="format">
          <span className="param__key">format=</span>
          <select
            id="format"
            value={form.format}
            onChange={(e) => set('format', e.target.value as OutputFormat | '')}
          >
            {FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
        </label>
        <label className="param" htmlFor="quality" data-disabled={!qualityEnabled || undefined}>
          <span className="param__key">quality=</span>
          <input
            id="quality"
            type="number"
            min={1}
            max={100}
            placeholder="auto"
            value={form.quality}
            disabled={!qualityEnabled}
            onChange={(e) => set('quality', e.target.value)}
          />
        </label>

        <div className="composer__actions">
          <button type="button" className="button button--ghost" onClick={onReset}>
            Reset
          </button>
          <button type="submit" className="button button--primary" disabled={loading}>
            {loading ? 'Processing…' : 'Send request'}
          </button>
        </div>
      </div>

      <ul className="composer__hints">
        <li>
          <code>crop</code> {cropEnabled ? cropHint : 'applies when both width and height are set.'}
        </li>
        {!qualityEnabled && (
          <li>
            <code>quality</code> has no effect on PNG or GIF output.
          </li>
        )}
      </ul>

      <div className="samples">
        <span className="samples__label">Try</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample.url}
            type="button"
            className="chip"
            onClick={() => onSubmit({ ...form, url: sample.url })}
          >
            {sample.label}
          </button>
        ))}
      </div>
    </form>
  );
}
