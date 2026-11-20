import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Edit3,
  Layers,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react';
import TopNav from './TopNav.tsx';

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
  const [counselorName, setCounselorName] = useState('Arun Reddy (Counselor)');

  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [portalUrlInput, setPortalUrlInput] = useState('/portal');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastIssuedToken, setLastIssuedToken] = useState<{
    token: string;
    caseId: string;
    portalUrl: string;
    approvedBy: string;
  } | null>(null);

  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [rejectReason, setRejectReason] = useState('');
  const [factDrafts, setFactDrafts] = useState<Record<number, string>>({});
  const [costOverrideDraft, setCostOverrideDraft] = useState('');
  const [costCurrencyDraft, setCostCurrencyDraft] = useState('GBP');

  const [showSettings, setShowSettings] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<CounselorSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setActionError(null);
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

  // Opens directly on load (no passcode gate)
  useEffect(() => {
    void loadQueue();
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
      setActionError('Please enter the approver name above before approving.');
      return;
    }
    setActionBusy(true);
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
      setActionMessage(
        `Approved ${currentCase.id} for ${data.approvalToken.portalUrl}. Single-use token issued by ${data.approvalToken.approvedBy}.`
      );
      await loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, counselorName, currentCase, loadQueue, portalUrlInput]);

  async function handleSaveEdits(e: FormEvent) {
    e.preventDefault();
    if (!currentCase || actionBusy) return;
    if (counselorName.trim().length < 2) {
      setActionError('Please enter the approver name above before saving edits.');
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
      setActionMessage(
        `Updated ${currentCase.id} and re-ran plain-code checks. New risk score: ${data.case.riskScore.score}/100.`
      );
      setMode('view');
      await loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Edit failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!currentCase || actionBusy) return;
    if (counselorName.trim().length < 2) {
      setActionError('Please enter the approver name above before rejecting.');
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
      setActionMessage(`Rejected ${currentCase.id} and logged reason in the audit log.`);
      setRejectReason('');
      setMode('view');
      await loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleBatchApproveGreen() {
    if (!queue || queue.greenBatch.length === 0 || actionBusy) return;
    if (counselorName.trim().length < 2) {
      setActionError('Please enter the approver name above before batch approving.');
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/counselor/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      await loadQueue();
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counselorName: counselorName.trim() || 'Counselor',
          ukRules: settingsDraft.ukRules,
          exchangeRates: settingsDraft.exchangeRates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Could not save settings.');
      setActionMessage('Saved updated UK rules and dated exchange rates to Firestore.');
      await loadQueue();
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
  }, [currentCase, handleApproveCurrent, mode, queue]);

  const totalEstimatedUsd = queue
    ? [...queue.exceptions, ...queue.greenBatch, ...queue.resolved].reduce(
        (sum, c) => sum + (c.usageSummary?.estimatedUsd || 0),
        0
      )
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#counselor-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <TopNav activeRoute="counselor" onNavigate={onNavigate} />

      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950 sm:text-sm">
        Demo mode: sample data only — counselor queue opens directly; enter your approver name below for the audit log.
      </div>

      <main id="counselor-main" className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* HERO BANNER WITH CUSTOM COUNSELOR SHIELD VISUAL */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
          <div className="grid items-center gap-6 md:grid-cols-4">
            <div className="space-y-3 md:col-span-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Human-in-the-Loop Safety Gate
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                Counselor Exception Queue
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">
                Review only high-stakes exceptions sorted by highest risk. Clean green cases pass
                plain-code rules and wait for your one-click batch approval—no Submit happens
                without your single-use token.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label
                  htmlFor="active-counselor-name"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-200"
                >
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  Approver name (for audit log &amp; tokens):
                </label>
                <input
                  id="active-counselor-name"
                  type="text"
                  value={counselorName}
                  onChange={(e) => setCounselorName(e.target.value)}
                  placeholder="Enter your name"
                  className="rounded-xl border border-emerald-400/50 bg-slate-800/90 px-3.5 py-2 text-sm font-semibold text-white placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                />
              </div>
            </div>

            <div className="flex justify-center md:justify-end">
              <img
                src="/assets/counselor-shield.jpg"
                alt="Counselor verification shield illustration"
                className="h-36 w-36 rounded-2xl border border-white/15 object-cover shadow-xl sm:h-40 sm:w-40"
              />
            </div>
          </div>
        </section>

        {loadingQueue && !queue ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-base font-medium text-slate-700 shadow-sm">
            Loading Counselor Queue...
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI SUMMARY STRIP */}
            <section aria-label="Queue summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">Exceptions Queue</span>
                  <ShieldAlert className="h-5 w-5 text-red-700" aria-hidden="true" />
                </div>
                <p className="mt-2 text-3xl font-extrabold text-red-700">
                  {queue?.exceptions.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-slate-600">Sorted highest risk first</p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">Green Batch Ready</span>
                  <Layers className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                </div>
                <p className="mt-2 text-3xl font-extrabold text-emerald-700">
                  {queue?.greenBatch.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-slate-600">Zero red flags · 1-click approve</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">Cleared Cases</span>
                  <CheckCircle2 className="h-5 w-5 text-blue-700" aria-hidden="true" />
                </div>
                <p className="mt-2 text-3xl font-extrabold text-slate-950">
                  {queue?.resolved.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-slate-600">Approved or returned</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">Queue AI Cost</span>
                  <DollarSign className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                </div>
                <p className="mt-2 font-mono text-3xl font-extrabold text-slate-950">
                  ${totalEstimatedUsd.toFixed(4)}
                </p>
                <p className="mt-1 text-xs text-slate-600">Tracked tokens across cases</p>
              </div>
            </section>

            {/* TOOLBAR + BATCH APPROVE */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">
                  Keyboard shortcuts:{' '}
                  <kbd className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">A</kbd>{' '}
                  Approve ·{' '}
                  <kbd className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">E</kbd>{' '}
                  Edit ·{' '}
                  <kbd className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">R</kbd>{' '}
                  Reject ·{' '}
                  <kbd className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">J</kbd>/
                  <kbd className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">K</kbd>{' '}
                  Next / Prev
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadQueue()}
                    disabled={loadingQueue}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingQueue ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>{loadingQueue ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                      showSettings
                        ? 'border-blue-700 bg-blue-50 text-blue-900'
                        : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    <span>{showSettings ? 'Hide Rules & Rates' : 'Rules & Rates'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAudit((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                      showAudit
                        ? 'border-blue-700 bg-blue-50 text-blue-900'
                        : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                    <span>Audit Log ({queue?.auditLog.length ?? 0})</span>
                  </button>
                </div>
              </div>

              {queue && queue.greenBatch.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                    <div>
                      <p className="text-base font-bold text-emerald-950">
                        {queue.greenBatch.length} green case(s) passed every plain-code rule
                      </p>
                      <p className="text-sm text-emerald-900">
                        No tokens are issued automatically—click Batch Approve to issue one
                        single-use portal token per green case.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleBatchApproveGreen()}
                    disabled={actionBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-base font-bold text-white shadow-sm hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    <span>Batch Approve {queue.greenBatch.length} Green Case(s)</span>
                  </button>
                </div>
              )}
            </section>

            {actionMessage && (
              <div
                role="status"
                className="space-y-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-base font-medium text-emerald-950 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span>{actionMessage}</span>
                </div>
                {lastIssuedToken && (
                  <div className="ml-8 flex flex-wrap items-center gap-3 pt-1">
                    <span className="rounded-lg bg-white px-3 py-1 font-mono text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">
                      Token: {lastIssuedToken.token.slice(0, 18)}...
                    </span>
                    <a
                      href={`/portal?caseId=${encodeURIComponent(lastIssuedToken.caseId)}&approvalToken=${encodeURIComponent(lastIssuedToken.token)}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                    >
                      Open /portal with Approved Token →
                    </a>
                  </div>
                )}
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-base font-medium text-red-900 shadow-sm"
              >
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                <span>{actionError}</span>
              </div>
            )}

            {/* ONE CASE PER SCREEN EXCEPTION FOCUS */}
            {currentCase ? (
              <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Exception {selectedIndex + 1} of {queue?.exceptions.length ?? 0} ·{' '}
                      <span className="font-mono text-slate-700">{currentCase.id}</span>
                    </p>
                    <h2 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">
                      {currentCase.consent?.typedSignature || 'Student'}{' '}
                      <span className="font-semibold text-slate-600">
                        ({currentCase.destinationCountry}
                        {currentCase.ukRegion ? ` · ${currentCase.ukRegion.replace('_', ' ')}` : ''})
                      </span>
                    </h2>
                    <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-700">
                      {currentCase.riskScore.brief}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2.5">
                    <span
                      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-base font-extrabold shadow-sm ${
                        currentCase.riskScore.level === 'high'
                          ? 'bg-red-700 text-white'
                          : currentCase.riskScore.level === 'medium'
                            ? 'bg-amber-700 text-white'
                            : 'bg-emerald-700 text-white'
                      }`}
                    >
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      Risk {currentCase.riskScore.score} / 100
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={selectedIndex === 0}
                        onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        <span>Prev (K)</span>
                      </button>
                      <button
                        type="button"
                        disabled={!queue || selectedIndex >= queue.exceptions.length - 1}
                        onClick={() =>
                          setSelectedIndex((i) =>
                            Math.min((queue?.exceptions.length ?? 1) - 1, i + 1)
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-40"
                      >
                        <span>Next (J)</span>
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* COST PER CASE */}
                {currentCase.usageSummary && (
                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="font-semibold text-slate-600">Input Tokens</p>
                      <p className="font-mono text-lg font-bold text-slate-950">
                        {currentCase.usageSummary.totalInputTokens.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-600">Output Tokens</p>
                      <p className="font-mono text-lg font-bold text-slate-950">
                        {currentCase.usageSummary.totalOutputTokens.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-600">Agent Steps</p>
                      <p className="font-mono text-lg font-bold text-slate-950">
                        {currentCase.usageSummary.agentSteps}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-600">Est. AI Cost (USD)</p>
                      <p className="font-mono text-lg font-bold text-emerald-800">
                        ${currentCase.usageSummary.estimatedUsd.toFixed(4)}
                      </p>
                    </div>
                  </div>
                )}

                {/* WHY THIS CASE IS IN EXCEPTIONS */}
                <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5">
                  <h3 className="flex items-center gap-2 text-base font-bold text-red-950">
                    <ShieldAlert className="h-5 w-5 text-red-700" aria-hidden="true" />
                    Why this case needs your eye
                  </h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-6 text-base text-red-950">
                    {currentCase.exceptionReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* FLAGS WITH QUOTES & FIXES */}
                <div className="space-y-4">
                  {currentCase.flags
                    .filter((f) => f.severity !== 'green')
                    .map((flag) => (
                      <article
                        key={flag.id}
                        className={`rounded-2xl border p-5 ${
                          flag.severity === 'red'
                            ? 'border-red-300 bg-red-50'
                            : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <p className="text-lg font-bold text-slate-950">{flag.title}</p>
                        <p className="mt-1.5 text-base text-slate-900">
                          {flag.explanation || flag.summary}
                        </p>
                        {flag.suggestedFix && (
                          <p className="mt-2 rounded-xl bg-white/80 px-3.5 py-2.5 text-sm font-medium text-slate-900">
                            <strong>Suggested fix:</strong> {flag.suggestedFix}
                          </p>
                        )}
                        {flag.mathLines && flag.mathLines.length > 0 && (
                          <ul className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-white p-3.5 font-mono text-sm text-slate-900">
                            {flag.mathLines.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        )}
                        {flag.quote && (
                          <blockquote className="mt-3 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 font-mono text-xs text-slate-800 sm:text-sm">
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
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-base focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
                  />
                </div>

                {/* PRIMARY ACTION BUTTONS */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleApproveCurrent()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    <span>Approve &amp; Issue Token</span>
                    <kbd className="ml-1 rounded bg-emerald-900/60 px-2 py-0.5 font-mono text-xs">A</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-700 bg-white px-5 py-3.5 text-base font-bold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                  >
                    <Edit3 className="h-5 w-5" aria-hidden="true" />
                    <span>{mode === 'edit' ? 'Cancel Edit' : 'Edit & Recheck'}</span>
                    <kbd className="ml-1 rounded bg-blue-100 px-2 py-0.5 font-mono text-xs text-blue-900">E</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode((m) => (m === 'reject' ? 'view' : 'reject'))}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
                  >
                    <XCircle className="h-5 w-5" aria-hidden="true" />
                    <span>{mode === 'reject' ? 'Cancel Reject' : 'Reject'}</span>
                    <kbd className="ml-1 rounded bg-red-900/60 px-2 py-0.5 font-mono text-xs">R</kbd>
                  </button>
                </div>

                {/* INLINE EDIT PANEL */}
                {mode === 'edit' && (
                  <form
                    onSubmit={handleSaveEdits}
                    className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50 p-5"
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
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base"
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
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base"
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
                          className="grid items-center gap-2 rounded-xl bg-white p-3 sm:grid-cols-3"
                        >
                          <label htmlFor={`fact-${idx}`} className="font-mono text-xs font-semibold text-slate-700">
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
                      className="rounded-xl bg-blue-700 px-5 py-3 text-base font-bold text-white hover:bg-blue-800"
                    >
                      Save Edits &amp; Recalculate Flags
                    </button>
                  </form>
                )}

                {/* INLINE REJECT PANEL */}
                {mode === 'reject' && (
                  <form
                    onSubmit={handleRejectSubmit}
                    className="space-y-3 rounded-2xl border border-red-300 bg-red-50 p-5"
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
                      className="w-full rounded-xl border border-red-300 bg-white p-3.5 text-base"
                    />
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="rounded-xl bg-red-700 px-5 py-3 text-base font-bold text-white hover:bg-red-800"
                    >
                      Confirm Reject &amp; Log
                    </button>
                  </form>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" aria-hidden="true" />
                <h2 className="mt-3 text-2xl font-bold text-emerald-950">Exception queue is clear</h2>
                <p className="mt-1 text-base text-emerald-900">
                  No cases currently need manual exception review.
                </p>
              </section>
            )}

            {/* EDITABLE RULES & EXCHANGE RATES */}
            {showSettings && settingsDraft && (
              <form
                onSubmit={handleSaveSettings}
                className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-xl font-bold text-slate-950">
                  Editable UK Rules &amp; Dated Exchange Rates
                </h2>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="set-uk-london" className="block text-sm font-semibold">
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
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-uk-outside" className="block text-sm font-semibold">
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
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
                    />
                  </div>
                  <div>
                    <label htmlFor="set-uk-days" className="block text-sm font-semibold">
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
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="set-rate-date" className="block text-sm font-semibold">
                      Rate as-of date
                    </label>
                    <input
                      id="set-rate-date"
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
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
                    />
                  </div>
                  {(['GBP', 'USD', 'EUR', 'CAD', 'AUD'] as const).map((curr) => (
                    <div key={curr}>
                      <label htmlFor={`set-rate-${curr}`} className="block text-sm font-semibold">
                        1 {curr} in INR
                      </label>
                      <input
                        id={`set-rate-${curr}`}
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
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="rounded-xl bg-blue-700 px-5 py-3 text-base font-bold text-white hover:bg-blue-800"
                >
                  {savingSettings ? 'Saving...' : 'Save Rules & Rates'}
                </button>
              </form>
            )}

            {/* AUDIT LOG */}
            {showAudit && queue && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-950">Audit Log</h2>
                <ul className="mt-3 space-y-2.5 text-sm">
                  {queue.auditLog.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
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
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-950">Recently Cleared Cases</h2>
                <ul className="mt-3 space-y-2.5 text-base">
                  {queue.resolved.slice(0, 10).map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5"
                    >
                      <div>
                        <span className="font-bold text-slate-950">
                          {c.consent?.typedSignature || c.id}
                        </span>{' '}
                        <span className="font-mono text-sm text-slate-600">({c.id})</span>
                        {c.approvalTokenId && (
                          <p className="mt-0.5 font-mono text-xs text-emerald-800">
                            Token: {c.approvalTokenId.slice(0, 16)}... · Portal:{' '}
                            {c.targetPortalUrl || '/portal'} · By: {c.approvedBy}
                          </p>
                        )}
                        {c.rejectedReason && (
                          <p className="mt-0.5 text-sm text-red-800">Reason: {c.rejectedReason}</p>
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
      </main>
    </div>
  );
}
