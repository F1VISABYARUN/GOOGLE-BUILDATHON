export const VIEWPORT_WIDTH = 1440;
export const VIEWPORT_HEIGHT = 900;

/**
 * Legal hard block: Common App and UCAS ban automated agents.
 * NEVER allow navigating to or automating these domains.
 */
export const BANNED_DOMAINS = [
  'commonapp.org',
  'ucas.com',
] as const;

export const PAYMENT_DOMAIN_PATTERNS = [
  'stripe.com',
  'checkout.stripe.com',
  'paypal.com',
  'flywire.com',
  'razorpay.com',
  'payu.in',
  'billdesk.com',
  'convera.com',
  'touchNet.com'.toLowerCase(),
] as const;

const PAYMENT_URL_REGEX = /\/(pay|payment|checkout|billing|card-payment|fee-payment|wire)\b/i;

const HIGH_STAKES_CLICK_REGEX =
  /\b(submit(\s+application)?|final\s+submit|pay(\s+now|\s+fee)?|payment|confirm\s+application|declaration|i\s+declare|sign(\s+and\s+submit)?|e-?sign|place\s+order|complete\s+application)\b/i;

const CAPTCHA_OR_OTP_REGEX =
  /\b(captcha|recaptcha|hcaptcha|turnstile|verify\s+you\s+are\s+human|phone\s+otp|sms\s+code|enter\s+otp\s+sent\s+to\s+(your\s+)?phone)\b/i;

/**
 * Scales a 0–999 normalized coordinate from Gemini Computer Use to the 1440x900 viewport.
 */
export function scaleCoordinate(coord: number, viewportSize: number): number {
  const clamped = Math.max(0, Math.min(999, Number(coord) || 0));
  return Math.round((clamped / 1000) * viewportSize);
}

export function scalePoint(x: number, y: number): { px: number; py: number } {
  return {
    px: scaleCoordinate(x, VIEWPORT_WIDTH),
    py: scaleCoordinate(y, VIEWPORT_HEIGHT),
  };
}

/**
 * Converts Meta+A / Command+A to Control+A for Linux Chromium containers.
 */
export function normalizeKeyComboForLinux(keys: string): string {
  return keys
    .replace(/\b(Meta|Command|Cmd|Super)\+/gi, 'Control+')
    .replace(/\bCtrl\+/gi, 'Control+')
    .replace(/\bReturn\b/gi, 'Enter');
}

export function extractHostname(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isDomainMatch(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const pat = pattern.toLowerCase().trim();
  if (!pat) return false;
  if (pat.startsWith('*.')) {
    const suffix = pat.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === pat || host.endsWith(`.${pat}`);
}

export function isBannedPortalUrl(urlStr: string): boolean {
  const host = extractHostname(urlStr);
  if (!host) return false;
  return BANNED_DOMAINS.some((banned) => isDomainMatch(host, banned));
}

export function isPaymentUrl(urlStr: string): boolean {
  const host = extractHostname(urlStr);
  if (host && PAYMENT_DOMAIN_PATTERNS.some((p) => isDomainMatch(host, p))) {
    return true;
  }
  return PAYMENT_URL_REGEX.test(urlStr);
}

export function isAllowlistedUrl(urlStr: string, allowlistedDomains: string[]): boolean {
  if (!urlStr || urlStr === 'about:blank') return true;
  if (isBannedPortalUrl(urlStr)) return false;
  const host = extractHostname(urlStr);
  if (!host) return false;
  return allowlistedDomains.some((domain) => isDomainMatch(host, domain));
}

export interface ActionFilterInput {
  actionName: string;
  args: Record<string, unknown>;
  currentUrl: string;
  allowlistedDomains: string[];
  hasValidApprovalToken: boolean;
  targetElementText?: string;
  pageTextSnippet?: string;
}

export interface ActionFilterDecision {
  allowed: boolean;
  blockReason?:
    | 'banned_portal'
    | 'domain_not_allowlisted'
    | 'payment_page_blocked'
    | 'submit_blocked_needs_counselor_token'
    | 'safety_confirmation_required'
    | 'captcha_or_phone_otp_detected';
  message?: string;
  routeToCounselor?: boolean;
}

/**
 * Plain-code action filter that runs BEFORE every browser action.
 * Never delegates security decisions to the model.
 */
export function evaluateActionFilter(input: ActionFilterInput): ActionFilterDecision {
  const {
    actionName,
    args,
    currentUrl,
    allowlistedDomains,
    hasValidApprovalToken,
    targetElementText = '',
    pageTextSnippet = '',
  } = input;

  // 1. Check Gemini safety_decision on arguments
  const safety = args.safety_decision as { decision?: string; explanation?: string } | undefined;
  if (safety && safety.decision === 'require_confirmation') {
    return {
      allowed: false,
      blockReason: 'safety_confirmation_required',
      message: `Model requested safety confirmation: ${safety.explanation || 'High-stakes action requires counselor approval.'}`,
      routeToCounselor: true,
    };
  }

  // 2. Check navigation URL & current URL against banned portals, payment pages, and allowlist
  const targetUrl =
    actionName === 'navigate' && typeof args.url === 'string' ? args.url : currentUrl;

  if (isBannedPortalUrl(targetUrl)) {
    return {
      allowed: false,
      blockReason: 'banned_portal',
      message: `Blocked: ${targetUrl} is Common App or UCAS. Aira only automates direct university portals and /portal.`,
      routeToCounselor: true,
    };
  }

  if (isPaymentUrl(targetUrl)) {
    return {
      allowed: false,
      blockReason: 'payment_page_blocked',
      message: `Blocked payment page (${targetUrl}). Application fees require explicit human review and payment.`,
      routeToCounselor: true,
    };
  }

  if (!isAllowlistedUrl(targetUrl, allowlistedDomains)) {
    return {
      allowed: false,
      blockReason: 'domain_not_allowlisted',
      message: `Blocked navigation outside allowlisted domains: ${targetUrl}`,
      routeToCounselor: true,
    };
  }

  // 3. Check for CAPTCHA or Phone OTP on page
  const intentStr = typeof args.intent === 'string' ? args.intent : '';
  if (CAPTCHA_OR_OTP_REGEX.test(pageTextSnippet) || CAPTCHA_OR_OTP_REGEX.test(intentStr)) {
    return {
      allowed: false,
      blockReason: 'captcha_or_phone_otp_detected',
      message: 'Paused: CAPTCHA or phone OTP detected. Student or counselor must complete it to resume.',
      routeToCounselor: false,
    };
  }

  // 4. Block clicks / submits / declarations / signatures / payments unless a valid counselor approval token exists
  const isInteractiveAction =
    actionName === 'click' ||
    actionName === 'click_at' ||
    actionName === 'double_click' ||
    actionName === 'key_combination' ||
    actionName === 'press_key' ||
    actionName === 'hotkey' ||
    actionName === 'type' ||
    actionName === 'type_text' ||
    actionName === 'type_text_at';

  if (isInteractiveAction) {
    const combinedSignals = `${targetElementText} ${intentStr}`;
    const isPaymentClick = /\b(pay\s+now|pay\s+fee|credit\s+card|checkout|payment)\b/i.test(
      combinedSignals
    );
    if (isPaymentClick) {
      return {
        allowed: false,
        blockReason: 'payment_page_blocked',
        message: 'Blocked payment action. Fee payments are never executed automatically.',
        routeToCounselor: true,
      };
    }

    if (HIGH_STAKES_CLICK_REGEX.test(combinedSignals) && !hasValidApprovalToken) {
      return {
        allowed: false,
        blockReason: 'submit_blocked_needs_counselor_token',
        message:
          'Blocked Submit/Declaration/Sign action: a valid single-use counselor approval token is required before final submission.',
        routeToCounselor: true,
      };
    }
  }

  return { allowed: true };
}
