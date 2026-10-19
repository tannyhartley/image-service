import dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { errors } from '../errors.js';

export interface UrlPolicy {
  allowedPorts: readonly number[];
  allowPrivateNetworks: boolean;
}

/**
 * Only globally routable unicast addresses are fetchable. This excludes
 * loopback, RFC 1918, link-local (cloud metadata lives at 169.254.169.254),
 * CGNAT, multicast, and IPv6 ranges that embed IPv4 addresses (NAT64, 6to4,
 * Teredo), which could otherwise be used to smuggle a private target through.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === 'unicast';
}

const defaultPort = (url: URL) => (url.protocol === 'https:' ? 443 : 80);

/**
 * Static checks that need no network access. Hostnames are checked again at
 * connect time by `guardedLookup`, so DNS rebinding cannot slip past this.
 */
export function assertFetchableUrl(url: URL, policy: UrlPolicy): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw errors.urlNotAllowed('Only http and https URLs can be fetched.');
  }
  if (url.username || url.password) {
    throw errors.urlNotAllowed('URLs with embedded credentials are not allowed.');
  }

  const port = url.port ? Number(url.port) : defaultPort(url);
  if (!policy.allowedPorts.includes(port)) {
    throw errors.urlNotAllowed(
      `Port ${port} is not allowed. Allowed ports: ${policy.allowedPorts.join(', ')}.`,
    );
  }

  if (policy.allowPrivateNetworks) return;

  // WHATWG URL parsing already normalises tricks like http://2130706433/ and
  // http://0x7f.1/ to dotted-quad form, and wraps IPv6 literals in brackets.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(host) && !isPublicAddress(host)) {
    throw errors.urlNotAllowed(
      'URLs pointing to private or reserved IP addresses are not allowed.',
    );
  }
}

export class BlockedAddressError extends Error {
  constructor(
    readonly hostname: string,
    readonly address: string,
  ) {
    super(`${hostname} resolves to a non-public address (${address})`);
    this.name = 'BlockedAddressError';
  }
}

/**
 * DNS lookup used by the outbound HTTP agent. Validating the resolved address
 * at connect time (rather than resolving once up front and fetching later)
 * means the IP we check is the IP we connect to.
 */
export const guardedLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: Error | null, address?: unknown, family?: number) => void,
) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);

    const blocked = addresses.find((entry) => !isPublicAddress(entry.address));
    if (blocked) return callback(new BlockedAddressError(hostname, blocked.address));

    if (options.all) return callback(null, addresses);
    const [first] = addresses;
    if (!first)
      return callback(
        Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }),
      );
    callback(null, first.address, first.family);
  });
}) as LookupFunction;
