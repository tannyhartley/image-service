import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { assertFetchableUrl, isPublicAddress } from '../src/fetch/url-policy.js';

const policy = { allowedPorts: [80, 443], allowPrivateNetworks: false };

function rejection(url: string) {
  try {
    assertFetchableUrl(new URL(url), policy);
    return undefined;
  } catch (err) {
    return err as ApiError;
  }
}

describe('isPublicAddress', () => {
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1', // IPv4-mapped
    '64:ff9b::a00:1', // NAT64 of 10.0.0.1
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('assertFetchableUrl', () => {
  it('accepts ordinary public URLs', () => {
    expect(rejection('https://example.com/cat.jpg')).toBeUndefined();
    expect(rejection('http://93.184.216.34/cat.jpg')).toBeUndefined();
  });

  it.each([
    ['file:///etc/passwd', /http and https/],
    ['ftp://example.com/a.png', /http and https/],
    ['https://user:pass@example.com/a.png', /credentials/],
    ['https://example.com:8443/a.png', /Port 8443/],
    ['http://127.0.0.1/a.png', /private or reserved/],
    ['http://[::1]/a.png', /private or reserved/],
    ['http://169.254.169.254/latest/meta-data/', /private or reserved/],
    ['http://2130706433/a.png', /private or reserved/], // decimal 127.0.0.1
    ['http://0x7f.1/a.png', /private or reserved/],
    ['http://[::ffff:10.0.0.1]/a.png', /private or reserved/],
  ])('rejects %s', (url, message) => {
    const err = rejection(url);
    expect(err).toBeInstanceOf(ApiError);
    expect(err?.code).toBe('URL_NOT_ALLOWED');
    expect(err?.message).toMatch(message);
  });

  it('allows private addresses only when explicitly enabled', () => {
    expect(() =>
      assertFetchableUrl(new URL('http://127.0.0.1/a.png'), {
        ...policy,
        allowPrivateNetworks: true,
      }),
    ).not.toThrow();
  });
});
