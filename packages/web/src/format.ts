export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatChange(before: number, after: number): string {
  const percent = Math.round(((after - before) / before) * 100);
  if (percent === 0) return 'same size';
  return percent < 0 ? `${-percent}% smaller` : `${percent}% larger`;
}

/** Single-quoted for POSIX shells; embedded single quotes are escaped. */
export function curlCommand(url: string, format = 'img'): string {
  const quoted = `'${url.replace(/'/g, `'\\''`)}'`;
  return `curl -sS -D - -o output.${format} ${quoted}`;
}
