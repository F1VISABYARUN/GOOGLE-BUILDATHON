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
    el.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
    ) !== null
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
      setActionMessage('Updated details and re-ran checks.');
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
    <div className="flex min-h-screen flex-col bg-[#FAF9F6] text-slate-900">
      <a
        href="#counselor-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#2563EB] focus:px-4 focus:py-2 focus:text-white"
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
        className="mx-auto w-full max-w-[1200px] flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8"
      >
        {/* 10x Counselor Admin Workspace Banner */}
        <section className="rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="max-w-2xl space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[12px] font-semibold text-[#2563EB]">
                  <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">
                    verified_user
                  </span>
                  <span>10x Counselor Admin Workspace</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-[#FAF9F6] px-3 py-0.5 text-[12px] font-semibold text-slate-600">
                  Exception Queue
                </span>
              </div>
              <h1 className="font-display text-[24px] font-extrabold tracking-tight text-slate-950 sm:text-[26px]">
                Calmly review &amp; verify 500+ student applications with 1 counselor
              </h1>
              <p className="text-[14px] leading-relaxed text-slate-600">
                AI audits every packet against official funding and academic rules and escalates
                only exceptions here. One click issues a single-use approval token before any
                university submit.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadQueue(false)}
                aria-label="Refresh queue"
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-slate-800 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">
                  refresh
                </span>
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                aria-expanded={showSettings}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  showSettings
                    ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                    : 'border-slate-300 bg-white text-slate-800 shadow-2xs hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">
                  tune
                </span>
                <span>Rules</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAudit((v) => !v)}
                aria-expanded={showAudit}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  showAudit
                    ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                    : 'border-slate-300 bg-white text-slate-800 shadow-2xs hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">
                  history
                </span>
                <span>Audit Log</span>
              </button>
            </div>
          </div>

          {queue && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-4 text-[13px]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                <span>
                  {queue.exceptions.length}{' '}
                  {queue.exceptions.length === 1 ? 'exception awaiting' : 'exceptions awaiting'}{' '}
                  review
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>{queue.greenBatch.length} green batch ready</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                <span>{queue.resolved.length} cleared</span>
              </span>
            </div>
          )}
        </section>

        {actionError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-red-300 bg-red-50 px-5 py-3.5 text-[15px] font-medium text-red-700"
          >
            <span className="material-symbols-outlined mt-0.5 !text-[20px]" aria-hidden="true">
              error
            </span>
            <span>{actionError}</span>
          </div>
        )}

        {/* Audit Log section (opens inline right below header so it is immediately visible & never blocked) */}
        {showAudit && queue && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <span className="material-symbols-outlined !text-[19px]" aria-hidden="true">
                    history
                  </span>
                </span>
                <div>
                  <h3 className="font-display text-[19px] font-bold text-slate-950">Audit Log</h3>
                  <p className="text-[13px] text-slate-500">
                    Immutable record of every counselor decision, token issue, and rule edit.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[13px] font-semibold text-slate-700">
                {queue.auditLog.length} {queue.auditLog.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            <ul className="mt-4 divide-y divide-slate-200/80 border-t border-slate-200/80 text-[14px]">
              {queue.auditLog.map((entry) => (
                <li key={entry.id} className="py-3.5">
                  <p className="font-semibold text-slate-900">
                    {entry.action}
                    {' · '}
                    {entry.actor}
                    {entry.caseId ? ` · ${entry.caseId}` : ''}
                    {' · '}
                    <span className="font-mono text-[13px] font-normal text-slate-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </p>
                  <p className="mt-1 text-[14px] text-slate-600">
                    {formatInrInText(entry.details)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Editable UK rules drawer */}
        {showSettings && settingsDraft && (
          <form
            onSubmit={handleSaveSettings}
            className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
          >
            <div>
              <h2 className="font-display text-[19px] font-bold text-slate-950">
                UK rules &amp; exchange rates
              </h2>
              <p className="mt-0.5 text-[13px] text-slate-500">
                Updates apply immediately to all new document checks and counselor re-checks.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="set-uk-london"
                  className="block text-[13px] font-semibold text-slate-700"
                >
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
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                />
              </div>
              <div>
                <label
                  htmlFor="set-uk-outside"
                  className="block text-[13px] font-semibold text-slate-700"
                >
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
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                />
              </div>
              <div>
                <label
                  htmlFor="set-uk-days"
                  className="block text-[13px] font-semibold text-slate-700"
                >
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
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-5 text-[14px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save rules'}
              </button>
            </div>
          </form>
        )}

        {loadingQueue && !queue ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center text-[15px] text-slate-600 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
            Loading exception queue...
          </div>
        ) : (
          <div className="space-y-6">
            {/* INBOX LAYOUT: Left list (340px on desktop) + Right review panel */}
            <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
              {/* LEFT EXCEPTION QUEUE */}
              <aside className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-[#FAF9F6] px-5 py-4">
                  <h2 className="font-display text-[16px] font-bold text-slate-950">
                    Exception Queue
                  </h2>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
                    {queue?.exceptions.length ?? 0}{' '}
                    {(queue?.exceptions.length ?? 0) === 1 ? 'case' : 'cases'}
                  </span>
                </div>

                {queue && queue.exceptions.length > 0 ? (
                  <ul className="max-h-[620px] divide-y divide-slate-200/70 overflow-y-auto">
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
                            aria-current={isSelected ? 'true' : undefined}
                            className={`flex w-full flex-col gap-2 border-l-4 px-5 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB] ${
                              isSelected
                                ? 'border-l-[#2563EB] bg-blue-50/50'
                                : 'border-l-transparent bg-white hover:bg-[#FAF9F6]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-display text-[15px] font-bold text-slate-950">
                                {item.consent?.typedSignature || 'Sample Applicant'}
                              </span>
                              <span className="shrink-0 text-[13px] font-medium text-slate-500">
                                {countryFlagEmoji(item.destinationCountry)}{' '}
                                {item.destinationCountry}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                                  isHigh
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {isHigh ? 'High risk' : 'Needs review'}
                              </span>
                              <span className="text-[13px] font-medium text-slate-500">
                                {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
                              </span>
                            </div>

                            <p className="font-mono text-[12px] text-slate-400">
                              <span className="sr-only">{item.id}</span>
                              <span aria-hidden="true">{shortTail(item.id)}</span>
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-8 text-center">
                    <span
                      className="material-symbols-outlined !text-[28px] text-emerald-600"
                      aria-hidden="true"
                    >
                      check_circle
                    </span>
                    <p className="mt-2 text-[14px] font-semibold text-slate-900">
                      All cases reviewed
                    </p>
                    <p className="mt-0.5 text-[13px] text-slate-500">
                      Zero exceptions waiting in queue.
                    </p>
                  </div>
                )}
              </aside>

              {/* RIGHT PANEL: Inline Approval Banner + Case Details + IssueCard */}
              <div className="space-y-4">
                {/* CRITICAL: Inline Emerald Approval Card right at top of right panel (never a blocking modal!) */}
                {lastIssuedToken && (
                  <div
                    role="status"
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-5 shadow-[0_2px_12px_rgba(16,185,129,0.08)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                          <span
                            className="material-symbols-outlined !text-[22px]"
                            aria-hidden="true"
                          >
                            verified
                          </span>
                        </span>
                        <div>
                          <h2 className="font-display text-[19px] font-bold text-slate-950">
                            Approval issued &amp; token ready
                          </h2>
                          <p className="mt-0.5 text-[14px] text-slate-700">
                            {actionMessage ||
                              `One-time approval token signed by ${lastIssuedToken.approvedBy}.`}{' '}
                            <span className="text-slate-500">
                              Case <span className="font-mono">{lastIssuedToken.caseId}</span>
                            </span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setLastIssuedToken(null)}
                        aria-label="Dismiss approval banner"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-emerald-100 hover:text-slate-900"
                      >
                        <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                          close
                        </span>
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-800">
                        Single-use approval token
                      </p>
                      <code className="block break-all rounded-xl border border-emerald-200 bg-white px-4 py-3 font-mono text-[13px] font-semibold text-slate-950 select-all">
                        {lastIssuedToken.token}
                      </code>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopy(lastIssuedToken.token, 'last-token')}
                        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-5 text-[14px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                      >
                        <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                          {copiedKey === 'last-token' ? 'check' : 'content_copy'}
                        </span>
                        <span>{copiedKey === 'last-token' ? 'Copied' : 'Copy token'}</span>
                      </button>

                      <a
                        href={`/portal?caseId=${encodeURIComponent(lastIssuedToken.caseId)}&approvalToken=${encodeURIComponent(lastIssuedToken.token)}`}
                        className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#2563EB] px-5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                      >
                        <span>Open University Portal →</span>
                      </a>
                    </div>
                  </div>
                )}

                {currentCase ? (
                  <>
                    {/* Student header & action bar */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-display text-[22px] font-extrabold tracking-tight text-slate-950">
                              {currentCase.consent?.typedSignature || 'Sample Applicant'}
                            </h2>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FAF9F6] px-3 py-0.5 text-[13px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
                              {countryFlagEmoji(currentCase.destinationCountry)}{' '}
                              {currentCase.destinationCountry}
                              {currentCase.ukRegion
                                ? ` · ${currentCase.ukRegion.replace('_', ' ')}`
                                : ''}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] text-slate-500">
                            Case{' '}
                            <code className="font-mono font-semibold text-slate-800">
                              <span className="sr-only">{currentCase.id}</span>
                              <span aria-hidden="true">{shortTail(currentCase.id)}</span>
                            </code>
                            {currentCase.usageSummary && (
                              <>
                                {' · '}
                                AI check cost ${currentCase.usageSummary.estimatedUsd.toFixed(4)}
                              </>
                            )}
                          </p>
                        </div>

                        {/* Actions bar: Approve & Issue Token (Primary) · Request fix (Secondary) · Reject (Destructive) */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            disabled={actionBusy || approvingCase}
                            onClick={() => void handleApproveCurrent()}
                            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#2563EB] px-5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 disabled:opacity-50"
                          >
                            <span
                              className="material-symbols-outlined !text-[18px]"
                              aria-hidden="true"
                            >
                              {approvingCase ? 'progress_activity' : 'verified'}
                            </span>
                            <span>
                              {approvingCase ? 'Approving...' : 'Approve & Issue Token'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
                            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                          >
                            <span>{mode === 'edit' ? 'Cancel' : 'Request fix'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setMode((m) => (m === 'reject' ? 'view' : 'reject'))}
                            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#DC2626] px-4 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                          >
                            <span>{mode === 'reject' ? 'Cancel' : 'Reject'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Inline Request fix / Edit drawer */}
                    {mode === 'edit' && (
                      <form
                        onSubmit={handleSaveEdits}
                        className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
                      >
                        <h3 className="font-display text-[18px] font-bold text-slate-950">
                          Update extracted details &amp; re-run checks
                        </h3>
                        <div className="grid gap-3.5 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="edit-cost"
                              className="block text-[13px] font-semibold text-slate-700"
                            >
                              Override required total cost (optional)
                            </label>
                            <input
                              id="edit-cost"
                              type="number"
                              min="0"
                              value={costOverrideDraft}
                              onChange={(e) => setCostOverrideDraft(e.target.value)}
                              placeholder="Leave blank for default UK rule"
                              className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="edit-curr"
                              className="block text-[13px] font-semibold text-slate-700"
                            >
                              Currency
                            </label>
                            <select
                              id="edit-curr"
                              value={costCurrencyDraft}
                              onChange={(e) => setCostCurrencyDraft(e.target.value)}
                              className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                            >
                              <option value="GBP">GBP</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                              <option value="INR">INR</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2.5 border-t border-slate-200/80 pt-4">
                          {currentCase.facts.slice(0, 8).map((fact, idx) => (
                            <div
                              key={idx}
                              className="grid items-center gap-2 sm:grid-cols-3"
                            >
                              <label
                                htmlFor={`fact-${idx}`}
                                className="text-[13px] font-semibold capitalize text-slate-600"
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
                                className="h-10 rounded-xl border border-slate-300 bg-white px-3.5 text-[14px] text-slate-950 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 sm:col-span-2"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="submit"
                            disabled={actionBusy}
                            className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-5 text-[14px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50"
                          >
                            Save &amp; re-check
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Inline Reject drawer */}
                    {mode === 'reject' && (
                      <form
                        onSubmit={handleRejectSubmit}
                        className="space-y-3.5 rounded-2xl border border-red-200 bg-red-50/80 p-6"
                      >
                        <label
                          htmlFor="reject-reason"
                          className="block font-display text-[16px] font-bold text-slate-950"
                        >
                          Reason for rejecting
                        </label>
                        <textarea
                          id="reject-reason"
                          rows={2}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="e.g. Upload an updated bank statement showing the required closing balance across the full 28-day period."
                          className="w-full rounded-xl border border-red-200 bg-white p-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 focus:border-[#DC2626] focus:outline-none focus:ring-2 focus:ring-red-200"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={actionBusy}
                            className="inline-flex h-11 items-center rounded-full bg-[#DC2626] px-5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:opacity-50"
                          >
                            Confirm reject
                          </button>
                        </div>
                      </form>
                    )}

                    {/* IssueCard stack */}
                    {currentCase.flags
                      .filter((f) => f.severity !== 'green')
                      .map((flag) => (
                        <IssueCard key={flag.id} flag={flag} />
                      ))}

                    {/* Subtle keyboard shortcut legend */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[13px] text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-2xs">
                          A
                        </kbd>
                        <span>Approve</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-2xs">
                          E
                        </kbd>
                        <span>Edit</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-2xs">
                          R
                        </kbd>
                        <span>Reject</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-2xs">
                          J
                        </kbd>
                        <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-2xs">
                          K
                        </kbd>
                        <span>Next / Prev</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                    <span
                      className="material-symbols-outlined !text-[36px] text-emerald-600"
                      aria-hidden="true"
                    >
                      check_circle
                    </span>
                    <h2 className="mt-2 font-display text-[20px] font-bold text-slate-950">
                      No cases need review right now
                    </h2>
                    <p className="mt-1 text-[14px] text-slate-600">
                      Every flagged application has been reviewed and logged.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Recently cleared: last 3 only, collapsed by default */}
            {queue && queue.resolved.length > 0 && (
              <details className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 transition hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">
                  <span className="font-display text-[16px] font-bold text-slate-950">
                    Recently cleared (last {Math.min(3, queue.resolved.length)})
                  </span>
                  <span
                    className="material-symbols-outlined !text-[20px] text-slate-500 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </summary>
                <ul className="divide-y divide-slate-200/80 border-t border-slate-200/80 px-6">
                  {queue.resolved.slice(0, 3).map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-[14px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">
                          {c.consent?.typedSignature || 'Sample Applicant'}
                        </span>
                        <code className="font-mono text-[13px] text-slate-500">
                          <span className="sr-only">{c.id}</span>
                          <span aria-hidden="true">{shortTail(c.id)}</span>
                        </code>
                        {c.approvalTokenId && (
                          <>
                            <span className="text-slate-300">·</span>
                            <code className="font-mono text-[13px] text-slate-800">
                              <span className="sr-only">{c.approvalTokenId}</span>
                              <span aria-hidden="true">{shortTail(c.approvalTokenId)}</span>
                            </code>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(c.approvalTokenId!, `cleared-tok-${c.id}`)
                              }
                              className="rounded-full border border-slate-300 bg-white px-3 py-0.5 text-[12px] font-semibold text-slate-800 transition hover:bg-slate-50"
                            >
                              {copiedKey === `cleared-tok-${c.id}` ? 'Copied' : 'Copy'}
                            </button>
                          </>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-3 py-0.5 text-[12px] font-semibold ${
                          c.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {c.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </main>

      <footer className="mt-12 border-t border-slate-200/80 bg-white px-4 py-6 text-center text-[14px] font-medium text-slate-600 sm:px-6">
        Global dreams, zero guesswork. AI prepares every application; a human counselor approves
        every submit.
      </footer>
    </div>
  );
}
