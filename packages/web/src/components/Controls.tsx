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
  { value: '', label: 'Keep original' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif', label: 'GIF' },
];

const CROP_MODES: Array<{ value: CropMode; label: string; hint: string }> = [
  { value: 'fit', label: 'Fit', hint: 'Fit inside the box, keeping the aspect ratio.' },
  { value: 'fill', label: 'Fill', hint: 'Cover the box exactly, cropping the overflow.' },
  { value: 'pad', label: 'Pad', hint: 'Fit inside the box, then pad to the exact size.' },
  { value: 'scale', label: 'Scale', hint: 'Stretch to the exact size, ignoring aspect ratio.' },
];

interface Props {
  form: FormState;
  loading: boolean;
  onChange: (form: FormState) => void;
  onSubmit: (form: FormState) => void;
  onReset: () => void;
}

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
    <form className="card controls" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="url">Source image URL</label>
        <input
          id="url"
          type="url"
          placeholder="https://example.com/photo.jpg"
          value={form.url}
          onChange={(e) => set('url', e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="samples">
          <span className="muted small">Try:</span>
          {SAMPLES.map((sample) => (
            <button
              key={sample.url}
              type="button"
              className="link-button small"
              onClick={() => onSubmit({ ...form, url: sample.url })}
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="width">Width</label>
          <input
            id="width"
            type="number"
            min={1}
            placeholder="auto"
            value={form.width}
            onChange={(e) => set('width', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="height">Height</label>
          <input
            id="height"
            type="number"
            min={1}
            placeholder="auto"
            value={form.height}
            onChange={(e) => set('height', e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="crop">Crop mode</label>
        <select
          id="crop"
          value={form.crop}
          disabled={!cropEnabled}
          onChange={(e) => set('crop', e.target.value as CropMode)}
        >
          {CROP_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <p className="hint">
          {cropEnabled ? cropHint : 'Applies when both width and height are set.'}
        </p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="format">Format</label>
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
        </div>
        <div className="field">
          <label htmlFor="quality">Quality</label>
          <input
            id="quality"
            type="number"
            min={1}
            max={100}
            placeholder="default"
            value={form.quality}
            disabled={!qualityEnabled}
            onChange={(e) => set('quality', e.target.value)}
          />
        </div>
      </div>
      {!qualityEnabled && <p className="hint">Quality has no effect on PNG or GIF output.</p>}

      <div className="actions">
        <button type="submit" className="button button--primary" disabled={loading}>
          {loading ? 'Processing…' : 'Process image'}
        </button>
        <button type="button" className="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </form>
  );
}
