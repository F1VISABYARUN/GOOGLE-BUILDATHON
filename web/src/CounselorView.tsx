import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import TopNav from './TopNav.tsx';
import IssueCard, { type IssueFlagData } from './IssueCard.tsx';
import { formatInrInText, shortTail } from './formatInr.ts';

function isTypingElement(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    return true;
  }
  return (
    el.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !== null
  );
}

function countryFlagEmoji(country: string): string {
  const c = (country || '').toUpperCase();
  if (c === 'UK' || c.includes('UNITED KINGDOM')) return '🇬🇧';
  if (c === 'US' || c.includes('UNITED STATES')) return '🇺🇸';
  if (c === 'CANADA') return '🇨🇦';
  if (c === 'AUSTRALIA') return '🇦🇺';
  if (c === 'GERMANY') return '🇩🇪';
  return '🌐';
}

interface VerifiedFact {
  field: string;
  value: string;
  quote: string;
  page: number;
  confidence: number;
  sourceDocName: string;
  sourceDocType: string;
  quoteVerified: boolean;
  needsReview: boolean;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  caseId?: string;
  details: string;
}

interface CounselorSettings {
  ukRules: {
    country: 'UK';
    asOf: string;
    sourceUrl: string;
    maintenance: {
      currency: 'GBP';
      londonPerMonth: number;
      outsideLondonPerMonth: number;
      maxMonths: number;
      note: string;
    };
    bankStatement: {
      minConsecutiveDaysHeld: number;
      maxAgeDays: number;
      sourceUrl: string;
      note: string;
    };
  };
  exchangeRates: {
    asOfDate: string;
    sourceNote: string;
    ratesToInr: Record<string, number>;
  };
  updatedAt: string;
  updatedBy: string;
}

interface CaseRecord {
  id: string;
  createdAt: string;
  status: 'needs_counselor_review' | 'ready_for_batch_approval' | 'approved' | 'rejected';
  queueBucket: 'exceptions' | 'green_batch';
  exceptionReasons: string[];
  riskScore: {
    score: number;
    level: 'high' | 'medium' | 'low';
    brief: string;
    modelUsed: string;
  };
  destinationCountry: string;
  ukRegion?: 'london' | 'outside_london';
  targetPortalUrl?: string;
  requiredCostOverride?: { amount: number; currency: string } | null;
  consent: { typedSignature: string; signedAt: string };
  documents: Array<{ fileName: string; documentType: string }>;
  facts: VerifiedFact[];
  flags: IssueFlagData[];
  approvalTokenId?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  usageSummary?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    agentSteps: number;
    estimatedUsd: number;
  };
}

interface QueueResponse {
  exceptions: CaseRecord[];
  greenBatch: CaseRecord[];
  resolved: CaseRecord[];
  auditLog: AuditLogEntry[];
  settings: CounselorSettings;
}

interface CounselorViewProps {
  onNavigate: (route: 'student' | 'counselor' | 'portal') => void;
}

export default function CounselorView({ onNavigate }: CounselorViewProps) {
  const [counselorName, setCounselorName] = useState('Arun Reddy');
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [portalUrlInput, setPortalUrlInput] = useState('/portal');
  const [actionBusy, setActionBusy] = useState(false);
  const [approvingCase, setApprovingCase] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [lastIssuedToken, setLastIssuedToken] = useState<{
    token: string;
    caseId: string;
    portalUrl: string;
    approvedBy: string;
  } | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [rejectReason, setRejectReason] = useState('');
  const [factDrafts, setFactDrafts] = useState<Record<number, string>>({});
  const [costOverrideDraft, setCostOverrideDraft] = useState('');
  const [costCurrencyDraft, setCostCurrencyDraft] = useState('GBP');

  const [showAudit, setShowAudit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<CounselorSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2500);
    } catch {
      setActionError('Could not copy to clipboard.');
    }
  }, []);

  const loadQueue = useCallback(async (silent = false) => {
    if (!silent) {
      setActionError(null);
    }
    try {
      const res = await fetch('/api/counselor/queue');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not load counselor queue.');
      }
      const typed = data as QueueResponse;
      setQueue(typed);
      setSettingsDraft(typed.settings);
      setSelectedIndex((prev) =>
        typed.exceptions.length === 0 ? 0 : Math.min(prev, typed.exceptions.length - 1)
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load queue.');
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue(true);
  }, [loadQueue]);

  const currentCase = queue?.exceptions[selectedIndex] ?? null;

  useEffect(() => {
    if (currentCase) {
      setPortalUrlInput(currentCase.targetPortalUrl || '/portal');
      setCostOverrideDraft(
        currentCase.requiredCostOverride ? String(currentCase.requiredCostOverride.amount) : ''
      );
      setCostCurrencyDraft(currentCase.requiredCostOverride?.currency || 'GBP');
      setFactDrafts({});
      setMode('view');
    }
  }, [currentCase?.id]);

  const handleApproveCurrent = useCallback(async () => {
    if (!currentCase || actionBusy) return;
    if (counselorName.trim().length < 2) {
      setActionError('Please enter your name in "Approving as" in the top bar.');
      return;
    }
    setActionBusy(true);
    setApprovingCase(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/counselor/cases/${currentCase.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          portalUrl: portalUrlInput.trim() || '/portal',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed.');
      setLastIssuedToken({
        token: data.approvalToken.token,
        caseId: currentCase.id,
        portalUrl: data.approvalToken.portalUrl,
        approvedBy: data.approvalToken.approvedBy,
      });
      setApprovalModalOpen(true);
      setActionMessage(`Approved by ${data.approvalToken.approvedBy}.`);
      await loadQueue(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setApprovingCase(false);
      setActionBusy(false);
    }
  }, [actionBusy, counselorName, currentCase, loadQueue, portalUrlInput]);

  async function handleSaveEdits(e: FormEvent) {
    e.preventDefault();
    if (!currentCase || actionBusy) return;
    if (counselorName.trim().length < 2) {
      setActionError('Please enter your name in "Approving as" in the top bar.');
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const factEdits = Object.entries(factDrafts).map(([idxStr, value]) => ({
        index: Number(idxStr),
        value,
        markVerified: true,
      }));
      const requiredCostOverride =
        costOverrideDraft.trim() && Number(costOverrideDraft) > 0
          ? { amount: Number(costOverrideDraft), currency: costCurrencyDraft }
          : null;

      const res = await fetch(`/api/counselor/cases/${currentCase.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          factEdits,
          requiredCostOverride,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save edits.');
      setActionMessage(`Updated details and re-ran checks.`);
      setMode('view');
      await loadQueue(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!currentCase || actionBusy) return;
    if (counselorName.trim().length < 2) {
      setActionError('Please enter your name in "Approving as" in the top bar.');
      return;
    }
    if (rejectReason.trim().length < 3) {
      setActionError('Please write a short reason for rejecting this case.');
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/counselor/cases/${currentCase.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          reason: rejectReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed.');
      setActionMessage('Case rejected and recorded in audit log.');
      setRejectReason('');
      setMode('view');
      await loadQueue(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settingsDraft || savingSettings) return;
    setSavingSettings(true);
    setActionError(null);
    try {
      const res = await fetch('/api/counselor/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counselorName: counselorName.trim() || 'Counselor',
          ukRules: settingsDraft.ukRules,
          exchangeRates: settingsDraft.exchangeRates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Could not save settings.');
      setActionMessage('Saved updated UK rules and exchange rates.');
      await loadQueue(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  // Keyboard shortcuts: A, E, R, J, K
  useEffect(() => {
    if (!queue) return;
    const activeQueue = queue;

    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingElement(e.target) || isTypingElement(document.activeElement)) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'j' && activeQueue.exceptions.length > 0) {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(activeQueue.exceptions.length - 1, i + 1));
      } else if (key === 'k' && activeQueue.exceptions.length > 0) {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key === 'a' && currentCase && mode === 'view') {
        e.preventDefault();
        void handleApproveCurrent();
      } else if (key === 'e' && currentCase) {
        e.preventDefault();
        setMode((m) => (m === 'edit' ? 'view' : 'edit'));
      } else if (key === 'r' && currentCase) {
        e.preventDefault();
        setMode((m) => (m === 'reject' ? 'view' : 'reject'));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentCase, handleApproveCurrent, mode, queue]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <a
        href="#counselor-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-[#1A73E8] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <TopNav
        activeRoute="counselor"
        onNavigate={onNavigate}
        approveCompleted={Boolean(lastIssuedToken)}
        counselorName={counselorName}
        onCounselorNameChange={setCounselorName}
      />

      <main
        id="counselor-main"
        className="mx-auto w-full max-w-[1120px] flex-1 space-y-6 px-4 py-6 sm:px-6"
      >
        <span className="sr-only">Counselor Exception Queue</span>

        {actionError && (
          <div
            role="alert"
            className="rounded-[12px] border border-[#F6AEA9] bg-[#FCE8E6] px-4 py-3 text-[16px] text-[#D93025]"
          >
            {actionError}
          </div>
        )}

        {/* Inline Approval Issued strip (also accessible when modal is closed) */}
        {lastIssuedToken && !approvalModalOpen && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#CEEAD6] bg-[#E6F4EA] px-5 py-3.5 text-[14px]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="material-symbols-outlined !text-[18px] text-[#188038]" aria-hidden="true">
                check_circle
              </span>
              <span className="font-semibold text-gray-900">Approval issued:</span>
              <code className="rounded bg-white px-2 py-0.5 font-mono text-[14px] font-semibold text-gray-900">
                <span className="sr-only">{lastIssuedToken.token}</span>
                <span aria-hidden="true">{shortTail(lastIssuedToken.token)}</span>
              </code>
              <button
                type="button"
                onClick={() => void handleCopy(lastIssuedToken.token, 'strip-token')}
                className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-gray-300 bg-white px-3 text-[14px] font-semibold text-gray-900 hover:bg-gray-50"
              >
                <span>{copiedKey === 'strip-token' ? 'Copied' : 'Copy token'}</span>
              </button>
            </div>
            <a
              href={`/portal?caseId=${encodeURIComponent(lastIssuedToken.caseId)}&approvalToken=${encodeURIComponent(lastIssuedToken.token)}`}
              className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-gray-300 bg-white px-3 text-[14px] font-semibold text-[#1A73E8] hover:bg-gray-50"
            >
              <span>Open university portal</span>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
                arrow_forward
              </span>
            </a>
          </div>
        )}

        {loadingQueue && !queue ? (
          <div className="rounded-[12px] border border-gray-200 bg-white p-8 text-center text-[16px] text-gray-600">
            Loading cases...
          </div>
        ) : (
          <div className="space-y-6">
            {/* INBOX LAYOUT: Left list (320px on desktop) + Right panel */}
            <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
              {/* LEFT LIST (320px) */}
              <aside className="overflow-hidden rounded-[12px] border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3.5">
                  <h1 className="text-[16px] font-bold text-gray-900">
                    {queue?.exceptions.length ?? 0}{' '}
                    {(queue?.exceptions.length ?? 0) === 1 ? 'case needs' : 'cases need'} review
                  </h1>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void loadQueue(false)}
                      aria-label="Refresh queue"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                    >
                      <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                        refresh
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSettings((v) => !v)}
                      className="rounded-[8px] px-2 py-1 text-[14px] font-medium text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                    >
                      Rules
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAudit((v) => !v)}
                      className="rounded-[8px] px-2 py-1 text-[14px] font-medium text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                    >
                      Audit Log
                    </button>
                  </div>
                </div>

                {queue && queue.exceptions.length > 0 ? (
                  <ul className="max-h-[600px] divide-y divide-gray-200 overflow-y-auto">
                    {queue.exceptions.map((item, idx) => {
                      const isSelected = idx === selectedIndex;
                      const issueCount = item.flags.filter((f) => f.severity !== 'green').length;
                      const isHigh =
                        item.riskScore.level === 'high' ||
                        item.flags.some((f) => f.severity === 'red');
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedIndex(idx)}
                            className={`flex w-full flex-col gap-1.5 border-l-4 px-4 py-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] ${
                              isSelected
                                ? 'border-l-[#1A73E8] bg-gray-50'
                                : 'border-l-transparent bg-white hover:bg-gray-50/70'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[16px] font-semibold text-gray-900">
                                {item.consent?.typedSignature || 'Sample Applicant'}
                              </span>
                              <span className="shrink-0 text-[14px] text-gray-600">
                                {countryFlagEmoji(item.destinationCountry)}{' '}
                                {item.destinationCountry}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[14px] font-semibold ${
                                  isHigh
                                    ? 'bg-[#FCE8E6] text-[#D93025]'
                                    : 'bg-[#FEF7E0] text-[#B06000]'
                                }`}
                              >
                                {isHigh ? 'High risk' : 'Needs review'}
                              </span>
                              <span className="text-[14px] font-medium text-gray-600">
                                {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
                              </span>
                            </div>
                            <span className="sr-only">{item.id}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-6 text-center text-[14px] text-gray-600">
                    All cases reviewed.
                  </div>
                )}
              </aside>

              {/* RIGHT PANEL: Same Issue Card as Results + Actions Bar */}
              <div className="space-y-4">
                {currentCase ? (
                  <>
                    {/* Student header strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-gray-200 bg-white px-6 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-[24px] font-bold text-gray-900">
                            {currentCase.consent?.typedSignature || 'Sample Applicant'}
                          </h2>
                          <span className="text-[16px] text-gray-600">
                            · {countryFlagEmoji(currentCase.destinationCountry)}{' '}
                            {currentCase.destinationCountry}
                            {currentCase.ukRegion
                              ? ` (${currentCase.ukRegion.replace('_', ' ')})`
                              : ''}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[14px] text-gray-600">
                          Case{' '}
                          <code className="font-mono text-gray-900">
                            <span className="sr-only">{currentCase.id}</span>
                            <span aria-hidden="true">{shortTail(currentCase.id)}</span>
                          </code>
                          {currentCase.usageSummary && (
                            <>
                              {' '}
                              · AI check cost ${currentCase.usageSummary.estimatedUsd.toFixed(4)}
                            </>
                          )}
                        </p>
                      </div>

                      {/* Actions bar: Approve (primary) · Request fix (secondary) · Reject (destructive) */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Sole Primary Button on Screen 3 */}
                        <button
                          type="button"
                          disabled={actionBusy || approvingCase}
                          onClick={() => void handleApproveCurrent()}
                          className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white transition hover:bg-[#1557B0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                            check
                          </span>
                          <span>{approvingCase ? 'Approving...' : 'Approve'}</span>
                          {!approvingCase && (
                            <span className="sr-only"> &amp; Issue Token</span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
                          className="inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-gray-300 bg-white px-4 text-[16px] font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                        >
                          <span>{mode === 'edit' ? 'Cancel' : 'Request fix'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setMode((m) => (m === 'reject' ? 'view' : 'reject'))}
                          className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#D93025] px-4 text-[16px] font-semibold text-white transition hover:bg-[#B3261E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93025]"
                        >
                          <span>{mode === 'reject' ? 'Cancel' : 'Reject'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline Request fix / Edit drawer */}
                    {mode === 'edit' && (
                      <form
                        onSubmit={handleSaveEdits}
                        className="space-y-4 rounded-[12px] border border-gray-200 bg-gray-50 p-5"
                      >
                        <h3 className="text-[18px] font-bold text-gray-900">
                          Update extracted details &amp; re-run checks
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor="edit-cost" className="block text-[14px] font-medium text-gray-900">
                              Override required total cost (optional)
                            </label>
                            <input
                              id="edit-cost"
                              type="number"
                              min="0"
                              value={costOverrideDraft}
                              onChange={(e) => setCostOverrideDraft(e.target.value)}
                              placeholder="Leave blank for default UK rule"
                              className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px]"
                            />
                          </div>
                          <div>
                            <label htmlFor="edit-curr" className="block text-[14px] font-medium text-gray-900">
                              Currency
                            </label>
                            <select
                              id="edit-curr"
                              value={costCurrencyDraft}
                              onChange={(e) => setCostCurrencyDraft(e.target.value)}
                              className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px]"
                            >
                              <option value="GBP">GBP</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                              <option value="INR">INR</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2 border-t border-gray-200 pt-3">
                          {currentCase.facts.slice(0, 8).map((fact, idx) => (
                            <div
                              key={idx}
                              className="grid items-center gap-2 sm:grid-cols-3"
                            >
                              <label
                                htmlFor={`fact-${idx}`}
                                className="text-[14px] font-medium text-gray-600"
                              >
                                {fact.field.replace(/_/g, ' ')}
                              </label>
                              <input
                                id={`fact-${idx}`}
                                type="text"
                                value={factDrafts[idx] ?? fact.value}
                                onChange={(e) =>
                                  setFactDrafts((prev) => ({ ...prev, [idx]: e.target.value }))
                                }
                                className="h-10 rounded-[8px] border border-gray-300 bg-white px-3 text-[14px] sm:col-span-2"
                              />
                            </div>
                          ))}
                        </div>

                        <button
                          type="submit"
                          disabled={actionBusy}
                          className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-100"
                        >
                          Save &amp; re-check
                        </button>
                      </form>
                    )}

                    {/* Inline Reject drawer */}
                    {mode === 'reject' && (
                      <form
                        onSubmit={handleRejectSubmit}
                        className="space-y-3 rounded-[12px] border border-[#F6AEA9] bg-[#FCE8E6] p-5"
                      >
                        <label
                          htmlFor="reject-reason"
                          className="block text-[16px] font-bold text-gray-900"
                        >
                          Reason for rejecting
                        </label>
                        <textarea
                          id="reject-reason"
                          rows={2}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="e.g. Upload a fresh 28-day bank statement without the 4 Nov dip."
                          className="w-full rounded-[8px] border border-gray-300 bg-white p-3 text-[16px]"
                        />
                        <button
                          type="submit"
                          disabled={actionBusy}
                          className="inline-flex h-11 items-center rounded-[8px] bg-[#D93025] px-4 text-[14px] font-semibold text-white hover:bg-[#B3261E]"
                        >
                          Confirm reject
                        </button>
                      </form>
                    )}

                    {/* Reuse the exact IssueCard component from Results */}
                    {currentCase.flags
                      .filter((f) => f.severity !== 'green')
                      .map((flag) => (
                        <IssueCard key={flag.id} flag={flag} />
                      ))}

                    {/* Footer shortcut hint */}
                    <p className="text-[14px] text-gray-600">
                      A approve · R reject · J/K next/prev
                    </p>
                  </>
                ) : (
                  <div className="rounded-[12px] border border-gray-200 bg-white p-8 text-center">
                    <span className="material-symbols-outlined !text-[32px] text-[#188038]" aria-hidden="true">
                      check_circle
                    </span>
                    <h2 className="mt-2 text-[18px] font-bold text-gray-900">
                      No cases need review right now
                    </h2>
                    <p className="mt-1 text-[14px] text-gray-600">
                      Every flagged application has been reviewed.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Editable UK rules drawer */}
            {showSettings && settingsDraft && (
              <form
                onSubmit={handleSaveSettings}
                className="space-y-4 rounded-[12px] border border-gray-200 bg-white p-6"
              >
                <h2 className="text-[18px] font-bold text-gray-900">
                  UK rules &amp; exchange rates
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="set-uk-london" className="block text-[14px] font-medium">
                      London (GBP/month)
                    </label>
                    <input
                      id="set-uk-london"
                      type="number"
                      value={settingsDraft.ukRules.maintenance.londonPerMonth}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          ukRules: {
                            ...settingsDraft.ukRules,
                            maintenance: {
                              ...settingsDraft.ukRules.maintenance,
                              londonPerMonth: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-uk-outside" className="block text-[14px] font-medium">
                      Outside London (GBP/month)
                    </label>
                    <input
                      id="set-uk-outside"
                      type="number"
                      value={settingsDraft.ukRules.maintenance.outsideLondonPerMonth}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          ukRules: {
                            ...settingsDraft.ukRules,
                            maintenance: {
                              ...settingsDraft.ukRules.maintenance,
                              outsideLondonPerMonth: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-uk-days" className="block text-[14px] font-medium">
                      28-day holding minimum
                    </label>
                    <input
                      id="set-uk-days"
                      type="number"
                      value={settingsDraft.ukRules.bankStatement.minConsecutiveDaysHeld}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          ukRules: {
                            ...settingsDraft.ukRules,
                            bankStatement: {
                              ...settingsDraft.ukRules.bankStatement,
                              minConsecutiveDaysHeld: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50"
                >
                  {savingSettings ? 'Saving...' : 'Save rules'}
                </button>
              </form>
            )}

            {/* Audit Log section (verified by verify_judge_loop.mjs) */}
            {showAudit && queue && (
              <section className="rounded-[12px] border border-gray-200 bg-white p-6">
                <h2 className="text-[18px] font-bold text-gray-900">Audit Log</h2>
                <ul className="mt-3 divide-y divide-gray-200 border-t border-gray-200 text-[14px]">
                  {queue.auditLog.map((entry) => (
                    <li key={entry.id} className="py-3">
                      <div className="font-semibold text-gray-900">
                        <span>
                          {entry.action} — {entry.actor}
                          {entry.caseId ? ` (${entry.caseId})` : ''}
                          {' · '}
                          <span className="font-mono text-[14px] font-normal text-gray-600">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-gray-600">{formatInrInText(entry.details)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recently cleared: last 3 only, collapsed by default */}
            {queue && queue.resolved.length > 0 && (
              <details className="group rounded-[12px] border border-gray-200 bg-gray-50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]">
                  <span className="text-[16px] font-bold text-gray-900">
                    Recently cleared (last {Math.min(3, queue.resolved.length)})
                  </span>
                  <span className="material-symbols-outlined !text-[20px] text-gray-600 transition-transform group-open:rotate-180" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <ul className="divide-y divide-gray-200 border-t border-gray-200 bg-white px-6">
                  {queue.resolved.slice(0, 3).map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-[14px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {c.consent?.typedSignature || 'Sample Applicant'}
                        </span>
                        <code className="font-mono text-gray-600">
                          <span className="sr-only">{c.id}</span>
                          <span aria-hidden="true">{shortTail(c.id)}</span>
                        </code>
                        {c.approvalTokenId && (
                          <>
                            <span className="text-gray-400">·</span>
                            <code className="font-mono text-gray-900">
                              <span className="sr-only">{c.approvalTokenId}</span>
                              <span aria-hidden="true">{shortTail(c.approvalTokenId)}</span>
                            </code>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(c.approvalTokenId!, `cleared-tok-${c.id}`)
                              }
                              className="rounded-[6px] border border-gray-300 bg-white px-2 py-0.5 text-[14px] font-medium text-gray-900 hover:bg-gray-50"
                            >
                              {copiedKey === `cleared-tok-${c.id}` ? 'Copied' : 'Copy'}
                            </button>
                          </>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[14px] font-semibold ${
                          c.status === 'approved'
                            ? 'bg-[#E6F4EA] text-[#188038]'
                            : 'bg-[#FCE8E6] text-[#D93025]'
                        }`}
                      >
                        {c.status === 'approved' ? 'Passed' : 'Rejected'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </main>

      {/* =======================================================================
          AFTER APPROVE MODAL: "Approval issued"
         ======================================================================= */}
      {approvalModalOpen && lastIssuedToken && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-[12px] border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[24px] text-[#188038]" aria-hidden="true">
                  check_circle
                </span>
                <h2 id="approval-modal-title" className="text-[24px] font-bold text-gray-900">
                  Approval issued
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setApprovalModalOpen(false)}
                aria-label="Close approval modal"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>

            <p className="mt-2 text-[16px] text-gray-600">
              {actionMessage || `One-time approval issued by ${lastIssuedToken.approvedBy}.`}
            </p>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-[14px] text-gray-600">One-time approval code</p>
                <code className="font-mono text-[16px] font-bold text-gray-900">
                  <span className="sr-only">{lastIssuedToken.token}</span>
                  <span aria-hidden="true">{shortTail(lastIssuedToken.token)}</span>
                </code>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(lastIssuedToken.token, 'last-token')}
                className="inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
              >
                <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                  {copiedKey === 'last-token' ? 'check' : 'content_copy'}
                </span>
                <span>{copiedKey === 'last-token' ? 'Copied' : 'Copy token'}</span>
              </button>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setApprovalModalOpen(false)}
                className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50"
              >
                Done
              </button>
              <a
                href={`/portal?caseId=${encodeURIComponent(lastIssuedToken.caseId)}&approvalToken=${encodeURIComponent(lastIssuedToken.token)}`}
                className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
              >
                <span>Open university portal</span>
                <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                  arrow_forward
                </span>
              </a>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-12 border-t border-gray-200 bg-white px-4 py-6 text-center text-[14px] font-medium text-gray-600 sm:px-6">
        Built for Indian students going abroad. UK rules live today; more countries next.
      </footer>
    </div>
  );
}
