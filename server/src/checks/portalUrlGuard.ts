import net from 'node:net';

export interface PortalUrlValidationSuccess {
  ok: true;
  normalizedUrl: string;
  allowedHost: string;
  allowedOrigin: string;
}

export interface PortalUrlValidationFailure {
  ok: false;
  error: string;
}

export type PortalUrlValidationResult =
  | PortalUrlValidationSuccess
  | PortalUrlValidationFailure;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
]);

const REDIRECT_PARAM_NAMES = new Set([
  'redirect',
  'redirect_uri',
  'redirect_url',
  'next',
  'url',
  'target',
  'return',
  'return_to',
  'returnurl',
  'goto',
  'dest',
  'destination',
  'continue',
  'callback',
]);

/**
 * Checks whether an IPv4 or IPv6 literal is loopback, link-local (including 169.254.169.254),
 * RFC1918 private, CGNAT, or unspecified.
 */
export function isPrivateOrInternalIp(host: string): boolean {
  const clean = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const ipVersion = net.isIP(clean);
  if (ipVersion === 4) {
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (ipVersion === 6) {
    // Reject loopback ::1, unspecified ::, unique local fc00::/7, link-local fe80::/10, and IPv4-mapped ::ffff:
    if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1') return true;
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) {
      return true;
    }
    if (clean.includes('::ffff:')) return true;
    return false;
  }

  // Also reject decimal/hex/octal obfuscated IPs like 2130706433 or 0x7f000001
  if (/^(0x[0-9a-f]+|\d+)$/i.test(clean)) {
    return true;
  }

  return false;
}

export function isBlockedInternalHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!lower) return true;
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith('.internal') || lower.endsWith('.local') || lower.endsWith('.localhost')) {
    return true;
  }
  return isPrivateOrInternalIp(lower);
}

/**
 * Strict SSRF guard for /api/agent/runs:
 * Accepts ONLY our own /portal URL on the exact same host as PUBLIC_WEB_URL (or request origin).
 * Rejects localhost, 169.254.169.254, internal/private IPs, foreign hosts, non-/portal paths,
 * userinfo spoofing, path traversal, and redirect query parameters with HTTP 400.
 */
export function validateOwnPortalUrl(
  rawPortalUrl: string,
  publicBaseUrl: string
): PortalUrlValidationResult {
  const input = (rawPortalUrl || '').trim();

  let canonicalBase: URL;
  try {
    canonicalBase = new URL(publicBaseUrl);
  } catch {
    return { ok: false, error: 'Server public base URL is misconfigured.' };
  }

  const canonicalHost = canonicalBase.hostname.toLowerCase();
  const canonicalOrigin = canonicalBase.origin;
  const canonicalPortalUrl = `${canonicalOrigin}/portal`;

  // Relative shortcut: empty or exact "/portal"
  if (!input || input === '/portal' || input === '/portal/') {
    return {
      ok: true,
      normalizedUrl: canonicalPortalUrl,
      allowedHost: canonicalHost,
      allowedOrigin: canonicalOrigin,
    };
  }

  // Reject backslashes, control characters, path traversal, or encoded dots
  if (/[\r\n\\]/.test(input) || input.includes('..') || /%2e/i.test(input) || /%2f/i.test(input)) {
    return {
      ok: false,
      error: 'Invalid portalUrl: only this app’s own /portal URL is allowed.',
    };
  }

  // Reject any non-"/portal" relative path
  if (input.startsWith('/')) {
    return {
      ok: false,
      error: 'Invalid portalUrl: only /portal on this host is allowed (external paths and redirects are rejected).',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return {
      ok: false,
      error: 'Invalid portalUrl: must be a valid URL pointing to this app’s own /portal.',
    };
  }

  // Only http/https schemes allowed
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      error: 'Blocked portalUrl: unsupported URL protocol.',
    };
  }

  // Block userinfo spoofing (e.g., https://trusted.host@169.254.169.254/portal)
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: 'Blocked portalUrl: credentials or userinfo in URL are not allowed.',
    };
  }

  const targetHost = parsed.hostname.toLowerCase();

  // Always block localhost, loopback, link-local (169.254.169.254), RFC1918 private IPs, and metadata hosts
  if (isBlockedInternalHostname(targetHost)) {
    return {
      ok: false,
      error: `Blocked portalUrl (${targetHost}): internal IPs, localhost, and metadata endpoints are not allowed.`,
    };
  }

  // Require exact same origin (protocol + host + port) as our own PUBLIC_WEB_URL
  if (parsed.origin.toLowerCase() !== canonicalOrigin.toLowerCase()) {
    return {
      ok: false,
      error: `Blocked portalUrl (${parsed.origin}): only our own host (${canonicalOrigin}/portal) is allowed.`,
    };
  }

  // Require strictly /portal path (no open-redirect paths or subpaths)
  const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
  if (normalizedPath !== '/portal') {
    return {
      ok: false,
      error: `Blocked portalUrl path (${parsed.pathname}): only /portal on this host is allowed.`,
    };
  }

  // Reject any redirect-like query parameters or URL values in query params
  for (const [key, val] of parsed.searchParams.entries()) {
    if (
      REDIRECT_PARAM_NAMES.has(key.toLowerCase()) ||
      /https?:\/\/|\/\//i.test(val)
    ) {
      return {
        ok: false,
        error: `Blocked portalUrl query parameter (${key}): redirects are not allowed.`,
      };
    }
  }

  return {
    ok: true,
    normalizedUrl: canonicalPortalUrl,
    allowedHost: canonicalHost,
    allowedOrigin: canonicalOrigin,
  };
}
