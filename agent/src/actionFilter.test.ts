import { describe, expect, it } from 'vitest';
import {
  evaluateActionFilter,
  normalizeKeyComboForLinux,
  scalePoint,
} from './actionFilter.js';

const ALLOWLIST = ['aira-web-217073132830.asia-south1.run.app', 'apply.example.edu'];

describe('actionFilter (Phase 4)', () => {
  it('scales 0-999 coordinates to 1440x900 viewport', () => {
    expect(scalePoint(500, 500)).toEqual({ px: 720, py: 450 });
    expect(scalePoint(0, 999)).toEqual({ px: 0, py: 899 });
    expect(scalePoint(999, 0)).toEqual({ px: 1439, py: 0 });
  });

  it('converts Meta+A / Cmd+A to Control+A for Linux Chromium', () => {
    expect(normalizeKeyComboForLinux('Meta+A')).toBe('Control+A');
    expect(normalizeKeyComboForLinux('Cmd+a')).toBe('Control+a');
    expect(normalizeKeyComboForLinux('Control+A')).toBe('Control+A');
  });

  it('hard-blocks Common App and UCAS even if attempted', () => {
    const commonApp = evaluateActionFilter({
      actionName: 'navigate',
      args: { url: 'https://apply.commonapp.org/login' },
      currentUrl: 'about:blank',
      allowlistedDomains: [...ALLOWLIST, 'commonapp.org'],
      hasValidApprovalToken: true,
    });
    expect(commonApp.allowed).toBe(false);
    expect(commonApp.blockReason).toBe('banned_portal');

    const ucas = evaluateActionFilter({
      actionName: 'navigate',
      args: { url: 'https://www.ucas.com/students' },
      currentUrl: 'about:blank',
      allowlistedDomains: [...ALLOWLIST, 'ucas.com'],
      hasValidApprovalToken: true,
    });
    expect(ucas.allowed).toBe(false);
    expect(ucas.blockReason).toBe('banned_portal');
  });

  it('blocks navigation outside allowlisted domains', () => {
    const res = evaluateActionFilter({
      actionName: 'navigate',
      args: { url: 'https://random-untrusted-site.example.com' },
      currentUrl: 'https://aira-web-217073132830.asia-south1.run.app/portal',
      allowlistedDomains: ALLOWLIST,
      hasValidApprovalToken: false,
    });
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toBe('domain_not_allowlisted');
  });

  it('blocks payment pages and payment clicks unconditionally', () => {
    const payPage = evaluateActionFilter({
      actionName: 'navigate',
      args: { url: 'https://apply.example.edu/checkout' },
      currentUrl: 'https://apply.example.edu/form',
      allowlistedDomains: ALLOWLIST,
      hasValidApprovalToken: true,
    });
    expect(payPage.allowed).toBe(false);
    expect(payPage.blockReason).toBe('payment_page_blocked');

    const payClick = evaluateActionFilter({
      actionName: 'click_at',
      args: { x: 400, y: 600, intent: 'Click Pay Fee button' },
      currentUrl: 'https://apply.example.edu/form',
      allowlistedDomains: ALLOWLIST,
      hasValidApprovalToken: true,
      targetElementText: 'Pay Now ($85)',
    });
    expect(payClick.allowed).toBe(false);
    expect(payClick.blockReason).toBe('payment_page_blocked');
  });

  it('blocks Submit, Confirm Application, Declaration, and Sign without a counselor token, then allows with a valid token', () => {
    for (const label of [
      'Submit Application',
      'Confirm Application',
      'I agree to the Declaration',
      'Sign and Continue',
    ]) {
      const blocked = evaluateActionFilter({
        actionName: 'click',
        args: { x: 500, y: 700, intent: `Click ${label}` },
        currentUrl: 'https://aira-web-217073132830.asia-south1.run.app/portal',
        allowlistedDomains: ALLOWLIST,
        hasValidApprovalToken: false,
        targetElementText: label,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.blockReason).toBe('submit_blocked_needs_counselor_token');
      expect(blocked.routeToCounselor).toBe(true);
    }

    const allowedWithToken = evaluateActionFilter({
      actionName: 'click_at',
      args: { x: 500, y: 700, intent: 'Click Submit Application' },
      currentUrl: 'https://aira-web-217073132830.asia-south1.run.app/portal',
      allowlistedDomains: ALLOWLIST,
      hasValidApprovalToken: true,
      targetElementText: 'Submit Application',
    });
    expect(allowedWithToken.allowed).toBe(true);
  });

  it('routes require_confirmation safety_decision to counselor queue', () => {
    const res = evaluateActionFilter({
      actionName: 'click_at',
      args: {
        x: 300,
        y: 400,
        safety_decision: {
          decision: 'require_confirmation',
          explanation: 'About to submit personal details.',
        },
      },
      currentUrl: 'https://aira-web-217073132830.asia-south1.run.app/portal',
      allowlistedDomains: ALLOWLIST,
      hasValidApprovalToken: false,
    });
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toBe('safety_confirmation_required');
    expect(res.routeToCounselor).toBe(true);
  });

  it('pauses on CAPTCHA or phone OTP detection', () => {
    const res = evaluateActionFilter({
      actionName: 'click_at',
      args: { x: 200, y: 200, intent: 'Continue login' },
      currentUrl: 'https://apply.example.edu/login',
      allowlistedDomains: ALLOWLIST,
      hasValidApprovalToken: false,
      pageTextSnippet: 'Please complete the reCAPTCHA to verify you are human.',
    });
    expect(res.allowed).toBe(false);
    expect(res.blockReason).toBe('captcha_or_phone_otp_detected');
  });
});
