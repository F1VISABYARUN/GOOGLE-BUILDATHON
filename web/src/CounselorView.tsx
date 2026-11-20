import { useCallback, useEffect, useState, type FormEvent } from 'react';

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

interface CheckFlag {
  id: string;
  checkType: string;
  severity: 'red' | 'amber' | 'green';
  title: string;
  summary: string;
  quote: string;
  sourceDocName?: string;
  sourceUrl?: string;
  ruleAsOf?: string;
  mathLines?: string[];
  explanation?: string;
  suggestedFix?: string;
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
  flags: CheckFlag[];
  approvalTokenId?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
}

interface QueueResponse {
  exceptions: CaseRecord[];
  greenBatch: CaseRecord[];
  resolved: CaseRecord[];
  auditLog: AuditLogEntry[];
  settings: CounselorSettings;
}

interface CounselorViewProps {
  onNavigateHome: () => void;
}

export default function CounselorView({ onNavigateHome }: CounselorViewProps) {
  const [passcode, setPasscode] = useState('');
  const [counselorName, setCounselorName] = useState('Counselor');
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [portalUrlInput, setPortalUrlInput] = useState('/portal');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit & Reject modal/panel states
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [rejectReason, setRejectReason] = useState('');
  const [factDrafts, setFactDrafts] = useState<Record<number, string>>({});
  const [costOverrideDraft, setCostOverrideDraft] = useState('');
  const [costCurrencyDraft, setCostCurrencyDraft] = useState('GBP');

  // Rules / Settings & Audit drawers
  const [showSettings, setShowSettings] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<CounselorSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadQueue = useCallback(
    async (activePasscode: string) => {
      setLoadingQueue(true);
      setActionError(null);
      try {
        const res = await fetch('/api/counselor/queue', {
          headers: { 'X-Counselor-Passcode': activePasscode },
        });
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
    },
    []
  );

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!passcode.trim()) {
      setAuthError('Please enter the counselor passcode.');
      return;
    }
    if (counselorName.trim().length < 2) {
      setAuthError('Please enter your name for the audit log.');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch('/api/counselor/verify', {
        method: 'POST',
        headers: { 'X-Counselor-Passcode': passcode.trim() },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Passcode check failed.');
      }
      setUnlocked(true);
      await loadQueue(passcode.trim());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid passcode.');
    } finally {
      setAuthLoading(false);
    }
  }

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
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/counselor/cases/${currentCase.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Counselor-Passcode': passcode.trim(),
        },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          portalUrl: portalUrlInput.trim() || '/portal',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed.');
      setActionMessage(
        `Approved ${currentCase.id} for ${data.approvalToken.portalUrl}. Single-use token issued (${data.approvalToken.token.slice(0, 14)}...) by ${data.approvalToken.approvedBy}.`
      );
      await loadQueue(passcode.trim());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, counselorName, currentCase, loadQueue, passcode, portalUrlInput]);

  async function handleSaveEdits(e: FormEvent) {
    e.preventDefault();
    if (!currentCase || actionBusy) return;
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
        headers: {
          'Content-Type': 'application/json',
          'X-Counselor-Passcode': passcode.trim(),
        },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          factEdits,
          requiredCostOverride,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save edits.');
      setActionMessage(
        `Updated ${currentCase.id} and re-ran plain-code checks. New risk score: ${data.case.riskScore.score}/100.`
      );
      setMode('view');
      await loadQueue(passcode.trim());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Edit failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!currentCase || actionBusy) return;
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
        headers: {
          'Content-Type': 'application/json',
          'X-Counselor-Passcode': passcode.trim(),
        },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          reason: rejectReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed.');
      setActionMessage(`Rejected ${currentCase.id} and logged reason in the audit log.`);
      setRejectReason('');
      setMode('view');
      await loadQueue(passcode.trim());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleBatchApproveGreen() {
    if (!queue || queue.greenBatch.length === 0 || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/counselor/batch-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Counselor-Passcode': passcode.trim(),
        },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          portalUrl: portalUrlInput.trim() || '/portal',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch approval failed.');
      setActionMessage(
        `Batch-approved ${data.approvedCount} green case(s) with individual single-use approval tokens.`
      );
      await loadQueue(passcode.trim());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Batch approval failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settingsDraft || savingSettings) return;
    setSavingSettings(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/counselor/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Counselor-Passcode': passcode.trim(),
        },
        body: JSON.stringify({
          counselorName: counselorName.trim(),
          ukRules: settingsDraft.ukRules,
          exchangeRates: settingsDraft.exchangeRates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Could not save settings.');
      setActionMessage('Saved updated UK rules and dated exchange rates to Firestore.');
      await loadQueue(passcode.trim());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  // Keyboard shortcuts: A = Approve, E = Edit, R = Reject, J = Next case, K = Previous case
  useEffect(() => {
    if (!unlocked || !queue) return;

    const activeQueue = queue;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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
  }, [currentCase, handleApproveCurrent, mode, queue, unlocked]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Aira Application Agent — Human Safety Gate
              </p>
              <h1 className="mt-1 text-3xl font-bold text-slate-950">Counselor Exception Queue</h1>
            </div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-300"
            >
              Student Upload View
            </button>
          </div>
          <p className="mt-2 text-base text-slate-700">
            Only high-stakes exceptions appear here, sorted highest risk first. Clean green cases are
            pre-approved by code rules and cleared in one click.
          </p>
        </header>

        {!unlocked ? (
          <form
            onSubmit={handleUnlock}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-2xl font-semibold text-slate-950">Sign in as Counselor</h2>
            <p className="text-base text-slate-700">
              Protected by <span className="font-mono text-sm">COUNSELOR_PASSCODE</span> stored in
              Google Secret Manager.
            </p>

            <div>
              <label htmlFor="counselor-name" className="block text-base font-semibold text-slate-900">
                Your name (recorded in approval tokens &amp; audit log)
              </label>
              <input
                id="counselor-name"
                type="text"
                value={counselorName}
                onChange={(e) => setCounselorName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
              />
            </div>

            <div>
              <label htmlFor="counselor-passcode" className="block text-base font-semibold text-slate-900">
                Counselor passcode
              </label>
              <input
                id="counselor-passcode"
                type="password"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode from Secret Manager"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
              />
            </div>

            {authError && (
              <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="rounded-xl bg-blue-700 px-6 py-3.5 text-lg font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-blue-400"
            >
              {authLoading ? 'Checking passcode...' : 'Unlock Counselor Queue'}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            {/* TOP BAR: QUEUE COUNTS + BATCH APPROVE + DRAWER TOGGLES */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-base font-semibold">
                  <span className="rounded-lg bg-red-100 px-3 py-1.5 text-red-900">
                    Exceptions: {queue?.exceptions.length ?? 0}
                  </span>
                  <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-emerald-900">
                    Green Batch Ready: {queue?.greenBatch.length ?? 0}
                  </span>
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-800">
                    Cleared: {queue?.resolved.length ?? 0}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadQueue(passcode.trim())}
                    disabled={loadingQueue}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    {loadingQueue ? 'Refreshing...' : 'Refresh Queue'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings((v) => !v)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    {showSettings ? 'Hide Rules & Rates' : 'Edit Rules & Rates'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAudit((v) => !v)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    {showAudit ? 'Hide Audit Log' : `Audit Log (${queue?.auditLog.length ?? 0})`}
                  </button>
                </div>
              </div>

              {queue && queue.greenBatch.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                  <div>
                    <p className="text-base font-semibold text-emerald-950">
                      {queue.greenBatch.length} green case(s) passed every plain-code rule
                    </p>
                    <p className="text-sm text-emerald-900">
                      All quotes verified, zero red flags, high confidence. Batch approval issues a
                      single-use portal token for each case.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleBatchApproveGreen()}
                    disabled={actionBusy}
                    className="rounded-xl bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:opacity-50"
                  >
                    Batch Approve {queue.greenBatch.length} Green Case(s)
                  </button>
                </div>
              )}

              <p className="mt-3 text-sm text-slate-600">
                Keyboard shortcuts:{' '}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono">A</kbd>{' '}
                Approve ·{' '}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono">E</kbd>{' '}
                Edit ·{' '}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono">R</kbd>{' '}
                Reject ·{' '}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono">J</kbd>/
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono">K</kbd>{' '}
                Next / Previous case
              </p>
            </section>

            {actionMessage && (
              <div
                role="status"
                className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-base font-medium text-emerald-950"
              >
                {actionMessage}
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900"
              >
                {actionError}
              </div>
            )}

            {/* ONE CASE PER SCREEN EXCEPTION FOCUS */}
            {currentCase ? (
              <section className="space-y-5 rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600">
                      Exception {selectedIndex + 1} of {queue?.exceptions.length ?? 0} ·{' '}
                      <span className="font-mono">{currentCase.id}</span>
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                      {currentCase.consent?.typedSignature || 'Student'} ({currentCase.destinationCountry}
                      {currentCase.ukRegion ? ` — ${currentCase.ukRegion}` : ''})
                    </h2>
                    <p className="mt-1 text-base text-slate-800">{currentCase.riskScore.brief}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-xl px-4 py-2 text-base font-bold ${
                        currentCase.riskScore.level === 'high'
                          ? 'bg-red-700 text-white'
                          : currentCase.riskScore.level === 'medium'
                            ? 'bg-amber-700 text-white'
                            : 'bg-emerald-700 text-white'
                      }`}
                    >
                      Risk Score: {currentCase.riskScore.score} / 100
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={selectedIndex === 0}
                        onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                      >
                        Prev (K)
                      </button>
                      <button
                        type="button"
                        disabled={!queue || selectedIndex >= queue.exceptions.length - 1}
                        onClick={() =>
                          setSelectedIndex((i) =>
                            Math.min((queue?.exceptions.length ?? 1) - 1, i + 1)
                          )
                        }
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                      >
                        Next (J)
                      </button>
                    </div>
                  </div>
                </div>

                {/* WHY THIS CASE IS IN EXCEPTIONS */}
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h3 className="text-base font-bold text-red-950">Why this case needs your eye</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-red-950">
                    {currentCase.exceptionReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* FLAGS WITH QUOTES & FIXES */}
                <div className="space-y-3">
                  {currentCase.flags
                    .filter((f) => f.severity !== 'green')
                    .map((flag) => (
                      <article
                        key={flag.id}
                        className={`rounded-xl border p-4 ${
                          flag.severity === 'red'
                            ? 'border-red-300 bg-red-50'
                            : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <p className="text-lg font-semibold text-slate-950">{flag.title}</p>
                        <p className="mt-1 text-base text-slate-900">
                          {flag.explanation || flag.summary}
                        </p>
                        {flag.suggestedFix && (
                          <p className="mt-1.5 text-base font-medium text-slate-900">
                            <strong>Suggested fix:</strong> {flag.suggestedFix}
                          </p>
                        )}
                        {flag.mathLines && flag.mathLines.length > 0 && (
                          <ul className="mt-2 space-y-1 rounded-lg bg-white p-3 font-mono text-sm text-slate-900">
                            {flag.mathLines.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        )}
                        {flag.quote && (
                          <blockquote className="mt-2 rounded-lg bg-white/90 px-3 py-2 font-mono text-sm text-slate-800">
                            Quote: {flag.quote}
                          </blockquote>
                        )}
                      </article>
                    ))}
                </div>

                {/* PORTAL URL TIED TO SINGLE-USE TOKEN */}
                <div>
                  <label htmlFor="portal-url" className="block text-sm font-semibold text-slate-800">
                    Portal URL tied to the single-use approval token
                  </label>
                  <input
                    id="portal-url"
                    type="text"
                    value={portalUrlInput}
                    onChange={(e) => setPortalUrlInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base"
                  />
                </div>

                {/* PRIMARY ACTION BUTTONS */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleApproveCurrent()}
                    className="rounded-xl bg-emerald-700 px-6 py-3.5 text-lg font-semibold text-white hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:opacity-50"
                  >
                    Approve &amp; Issue Token (A)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
                    className="rounded-xl border-2 border-blue-700 bg-white px-6 py-3.5 text-lg font-semibold text-blue-800 hover:bg-blue-50"
                  >
                    {mode === 'edit' ? 'Cancel Edit' : 'Edit Facts & Recheck (E)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode((m) => (m === 'reject' ? 'view' : 'reject'))}
                    className="rounded-xl bg-red-700 px-6 py-3.5 text-lg font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300"
                  >
                    {mode === 'reject' ? 'Cancel Reject' : 'Reject Case (R)'}
                  </button>
                </div>

                {/* INLINE EDIT PANEL */}
                {mode === 'edit' && (
                  <form
                    onSubmit={handleSaveEdits}
                    className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4"
                  >
                    <h3 className="text-lg font-bold text-blue-950">
                      Edit Facts or Required Cost &amp; Re-run Plain-Code Checks
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="edit-cost" className="block text-sm font-semibold">
                          Override required total cost (optional)
                        </label>
                        <input
                          id="edit-cost"
                          type="number"
                          min="0"
                          value={costOverrideDraft}
                          onChange={(e) => setCostOverrideDraft(e.target.value)}
                          placeholder="Leave blank to use CAS + UK rules"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
                        />
                      </div>
                      <div>
                        <label htmlFor="edit-curr" className="block text-sm font-semibold">
                          Currency
                        </label>
                        <select
                          id="edit-curr"
                          value={costCurrencyDraft}
                          onChange={(e) => setCostCurrencyDraft(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
                        >
                          <option value="GBP">GBP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="INR">INR</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {currentCase.facts.map((fact, idx) => (
                        <div
                          key={idx}
                          className="grid items-center gap-2 rounded-lg bg-white p-2.5 sm:grid-cols-3"
                        >
                          <label htmlFor={`fact-${idx}`} className="font-mono text-sm text-slate-700">
                            {fact.field} ({fact.sourceDocName})
                          </label>
                          <input
                            id={`fact-${idx}`}
                            type="text"
                            value={factDrafts[idx] ?? fact.value}
                            onChange={(e) =>
                              setFactDrafts((prev) => ({ ...prev, [idx]: e.target.value }))
                            }
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-base sm:col-span-2"
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="rounded-xl bg-blue-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-blue-800"
                    >
                      Save Edits &amp; Recalculate Flags
                    </button>
                  </form>
                )}

                {/* INLINE REJECT PANEL */}
                {mode === 'reject' && (
                  <form
                    onSubmit={handleRejectSubmit}
                    className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4"
                  >
                    <label htmlFor="reject-reason" className="block text-base font-bold text-red-950">
                      Reason for rejecting / returning to student
                    </label>
                    <textarea
                      id="reject-reason"
                      rows={3}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Bank statement does not cover 28 consecutive days; ask student to upload an updated statement."
                      className="w-full rounded-lg border border-red-300 bg-white p-3 text-base"
                    />
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="rounded-xl bg-red-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-red-800"
                    >
                      Confirm Reject &amp; Log
                    </button>
                  </form>
                )}
              </section>
            ) : (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                <h2 className="text-2xl font-bold text-emerald-950">Exception queue is clear!</h2>
                <p className="mt-2 text-base text-emerald-900">
                  No cases currently need manual exception review.
                </p>
              </section>
            )}

            {/* EDITABLE RULES & EXCHANGE RATES */}
            {showSettings && settingsDraft && (
              <form
                onSubmit={handleSaveSettings}
                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-xl font-bold text-slate-950">
                  Editable UK Rules &amp; Dated Exchange Rates
                </h2>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-semibold">London (GBP/month)</label>
                    <input
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
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold">Outside London (GBP/month)</label>
                    <input
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
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold">28-day holding minimum</label>
                    <input
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
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-semibold">Rate as-of date</label>
                    <input
                      type="date"
                      value={settingsDraft.exchangeRates.asOfDate}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          exchangeRates: {
                            ...settingsDraft.exchangeRates,
                            asOfDate: e.target.value,
                          },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                  {(['GBP', 'USD', 'EUR', 'CAD', 'AUD'] as const).map((curr) => (
                    <div key={curr}>
                      <label className="block text-sm font-semibold">1 {curr} in INR</label>
                      <input
                        type="number"
                        step="0.01"
                        value={settingsDraft.exchangeRates.ratesToInr[curr] ?? ''}
                        onChange={(e) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            exchangeRates: {
                              ...settingsDraft.exchangeRates,
                              ratesToInr: {
                                ...settingsDraft.exchangeRates.ratesToInr,
                                [curr]: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="rounded-xl bg-blue-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-blue-800"
                >
                  {savingSettings ? 'Saving...' : 'Save Rules & Rates'}
                </button>
              </form>
            )}

            {/* AUDIT LOG */}
            {showAudit && queue && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-950">Audit Log</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {queue.auditLog.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5"
                    >
                      <div className="flex flex-wrap justify-between gap-2 font-semibold text-slate-900">
                        <span>
                          {entry.action} — {entry.actor}
                          {entry.caseId ? ` (${entry.caseId})` : ''}
                        </span>
                        <span className="font-mono text-xs text-slate-600">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700">{entry.details}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* RECENTLY CLEARED CASES */}
            {queue && queue.resolved.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-950">Recently Cleared Cases</h2>
                <ul className="mt-3 space-y-2 text-base">
                  {queue.resolved.slice(0, 10).map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <span className="font-semibold">{c.consent?.typedSignature || c.id}</span>{' '}
                        <span className="font-mono text-sm text-slate-600">({c.id})</span>
                        {c.approvalTokenId && (
                          <p className="font-mono text-xs text-emerald-800">
                            Token: {c.approvalTokenId.slice(0, 16)}... · Portal:{' '}
                            {c.targetPortalUrl || '/portal'} · By: {c.approvedBy}
                          </p>
                        )}
                        {c.rejectedReason && (
                          <p className="text-sm text-red-800">Reason: {c.rejectedReason}</p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                          c.status === 'approved'
                            ? 'bg-emerald-200 text-emerald-950'
                            : 'bg-red-200 text-red-950'
                        }`}
                      >
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
