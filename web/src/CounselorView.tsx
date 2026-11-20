import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  DollarSign,
  Edit3,
  HelpCircle,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react';
import TopNav from './TopNav.tsx';
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
  const [refreshingQueue, setRefreshingQueue] = useState(false);
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

  const [showSettings, setShowSettings] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
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
      setRefreshingQueue(true);
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
      if (!silent) {
        setRefreshingQueue(false);
      }
    }
  }, []);

  // Opens directly on load (no passcode gate)
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
      setActionError('Please enter the approver name above before approving.');
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
      setActionMessage(
        `Approved case ${shortTail(currentCase.id)} for University portal. Single-use token issued by ${data.approvalToken.approvedBy}.`
      );
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
      await loadQueue(true);
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
      await loadQueue(true);
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
      await loadQueue(true);
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

  const totalEstimatedUsd = queue
    ? [...queue.exceptions, ...queue.greenBatch, ...queue.resolved].reduce(
        (sum, c) => sum + (c.usageSummary?.estimatedUsd || 0),
        0
      )
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <a
        href="#counselor-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-700 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <TopNav
        activeRoute="counselor"
        onNavigate={onNavigate}
        approveCompleted={Boolean(lastIssuedToken)}
      />

      <main id="counselor-main" className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {/* COMPACT UNIFIED HEADER + APPROVER BAR + CONTROLS */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                Counselor Exception Queue
              </h1>
              <p className="mt-1 text-base font-bold text-slate-800">
                {queue?.exceptions.length ?? 0}{' '}
                {(queue?.exceptions.length ?? 0) === 1 ? 'case needs' : 'cases need'} review
                {queue && queue.greenBatch.length > 0 && (
                  <span className="ml-2 text-emerald-700">
                    · {queue.greenBatch.length} clean ready for 1-click approval
                  </span>
                )}
                <span className="ml-2 text-sm font-medium text-slate-600">
                  · {queue?.resolved.length ?? 0} cleared
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="active-counselor-name"
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-800"
              >
                <UserCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Approver:
              </label>
              <input
                id="active-counselor-name"
                type="text"
                value={counselorName}
                onChange={(e) => setCounselorName(e.target.value)}
                placeholder="Enter your name"
                className="w-48 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
            <p className="text-xs font-medium text-slate-600 sm:text-sm">
              Only high-risk files land here — nothing submits without your single-use approval token.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowShortcuts((v) => !v)}
                aria-expanded={showShortcuts}
                aria-label="Toggle keyboard shortcuts help"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 sm:text-sm ${
                  showShortcuts
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                }`}
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
                <span>?</span>
              </button>
              <button
                type="button"
                onClick={() => void loadQueue(false)}
                disabled={refreshingQueue}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:opacity-50 sm:text-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingQueue ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{refreshingQueue ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 sm:text-sm ${
                  showSettings
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showSettings ? 'Hide Rules' : 'Rules & Rates'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAudit((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 sm:text-sm ${
                  showAudit
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Audit Log ({queue?.auditLog.length ?? 0})</span>
              </button>
            </div>
          </div>

          {showShortcuts && (
            <div
              role="note"
              className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2 text-xs font-medium text-slate-900 sm:text-sm"
            >
              <span className="font-bold">Keyboard shortcuts:</span>
              <span><kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold">A</kbd> Approve</span>
              <span><kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold">E</kbd> Edit</span>
              <span><kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold">R</kbd> Reject</span>
              <span><kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold">J</kbd> / <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-bold">K</kbd> Next / Prev</span>
            </div>
          )}

          {queue && queue.greenBatch.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-emerald-950 sm:text-base">
                    {queue.greenBatch.length} clean case(s) passed every rule
                  </p>
                  <p className="text-xs text-emerald-900 sm:text-sm">
                    No tokens are issued automatically — click Batch Approve to issue single-use tokens.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleBatchApproveGreen()}
                disabled={actionBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Batch Approve {queue.greenBatch.length} Case(s)</span>
              </button>
            </div>
          )}
        </section>

        {loadingQueue && !queue ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-base font-medium text-slate-700 shadow-sm">
            Loading Counselor Queue...
          </div>
        ) : (
          <div className="space-y-5">

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
                  <div className="ml-8 space-y-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-emerald-900">
                        Approval Token:
                      </span>
                      <code
                        title={lastIssuedToken.token}
                        className="rounded-lg bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-950 ring-1 ring-emerald-200"
                      >
                        <span className="sr-only">{lastIssuedToken.token}</span>
                        <span aria-hidden="true">{shortTail(lastIssuedToken.token)}</span>
                      </code>
                      <button
                        type="button"
                        onClick={() => void handleCopy(lastIssuedToken.token, 'last-token')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                      >
                        {copiedKey === 'last-token' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-700" aria-hidden="true" />
                            <span>Copy token</span>
                          </>
                        )}
                      </button>
                      <a
                        href={`/portal?caseId=${encodeURIComponent(lastIssuedToken.caseId)}&approvalToken=${encodeURIComponent(lastIssuedToken.token)}`}
                        className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                      >
                        Open University portal with token →
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-900">
                      <span className="font-semibold">Case ID:</span>
                      <code
                        title={lastIssuedToken.caseId}
                        className="rounded bg-white/90 px-2 py-0.5 font-mono font-semibold text-slate-950 ring-1 ring-emerald-200"
                      >
                        <span className="sr-only">{lastIssuedToken.caseId}</span>
                        <span aria-hidden="true">{shortTail(lastIssuedToken.caseId)}</span>
                      </code>
                      <button
                        type="button"
                        onClick={() => void handleCopy(lastIssuedToken.caseId, 'last-case-id')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        {copiedKey === 'last-case-id' ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-slate-600" aria-hidden="true" />
                            <span>Copy ID</span>
                          </>
                        )}
                      </button>
                    </div>
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
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <span>
                        Exception {selectedIndex + 1} of {queue?.exceptions.length ?? 0}
                      </span>
                      <span aria-hidden="true">·</span>
                      <code title={currentCase.id} className="font-mono text-slate-700">
                        <span className="sr-only">{currentCase.id}</span>
                        <span aria-hidden="true">{shortTail(currentCase.id)}</span>
                      </code>
                      <button
                        type="button"
                        onClick={() => void handleCopy(currentCase.id, `current-case-${currentCase.id}`)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-semibold normal-case tracking-normal text-slate-700 hover:bg-slate-100"
                      >
                        {copiedKey === `current-case-${currentCase.id}` ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-slate-600" aria-hidden="true" />
                            <span>Copy ID</span>
                          </>
                        )}
                      </button>
                    </div>
                    <h2 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">
                      {currentCase.consent?.typedSignature || 'Student'}{' '}
                      <span className="font-semibold text-slate-600">
                        ({currentCase.destinationCountry}
                        {currentCase.ukRegion ? ` · ${currentCase.ukRegion.replace('_', ' ')}` : ''})
                      </span>
                    </h2>
                    <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-700">
                      {formatInrInText(currentCase.riskScore.brief)}
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
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
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
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <span>Next (J)</span>
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* PER-CASE AI COST PILL (clean spacing between cost and agent steps) */}
                {currentCase.usageSummary && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                      <DollarSign className="h-4 w-4 text-slate-600" aria-hidden="true" />
                      AI verification cost:{' '}
                      <strong className="font-mono text-slate-950">
                        ${currentCase.usageSummary.estimatedUsd.toFixed(4)}
                      </strong>
                    </span>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="text-xs font-medium text-slate-700">
                      {currentCase.usageSummary.agentSteps} agent step(s)
                    </span>
                  </div>
                )}

                {/* FLAGGED ISSUES WITH HIGHLIGHTED QUOTES & COLLAPSED CALCULATION */}
                <div className="space-y-4">
                  {currentCase.flags
                    .filter((f) => f.severity !== 'green')
                    .map((flag) => (
                      <article
                        key={flag.id}
                        className={`rounded-2xl border p-5 ${
                          flag.severity === 'red'
                            ? 'border-red-300 bg-red-50/80'
                            : 'border-amber-300 bg-amber-50/80'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <ShieldAlert
                            className={`h-5 w-5 shrink-0 ${
                              flag.severity === 'red' ? 'text-red-700' : 'text-amber-700'
                            }`}
                            aria-hidden="true"
                          />
                          <p className="text-lg font-extrabold text-slate-950">
                            {formatInrInText(flag.title)}
                          </p>
                        </div>
                        <p className="mt-1.5 text-base text-slate-800">
                          {formatInrInText(flag.explanation || flag.summary)}
                        </p>
                        {flag.quote && (
                          <blockquote className="mt-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-3.5 py-2.5 font-mono text-xs font-medium text-slate-950 sm:text-sm">
                            <span className="font-sans text-xs font-bold uppercase tracking-wide text-amber-950">
                              Quote:{' '}
                            </span>
                            {flag.quote}
                          </blockquote>
                        )}
                        {flag.suggestedFix && (
                          <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900">
                            <strong className="text-slate-950">How to fix:</strong>{' '}
                            {formatInrInText(flag.suggestedFix)}
                          </p>
                        )}
                        {flag.mathLines && flag.mathLines.length > 0 && (
                          <details className="mt-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-700">
                            <summary className="cursor-pointer font-bold text-blue-700 hover:underline">
                              Show funds calculation
                            </summary>
                            <ul className="mt-2 space-y-1 font-mono text-xs text-slate-900">
                              {flag.mathLines.map((line, i) => (
                                <li key={i}>{formatInrInText(line)}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </article>
                    ))}
                </div>

                {/* PRIMARY ACTION BUTTONS + VISIBLE SHORTCUT HINT */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={actionBusy || approvingCase}
                      onClick={() => void handleApproveCurrent()}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                      <span>{approvingCase ? 'Approving...' : 'Approve & Issue Token'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-base font-bold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                    >
                      <Edit3 className="h-5 w-5" aria-hidden="true" />
                      <span>{mode === 'edit' ? 'Cancel Edit' : 'Edit & Recheck'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode((m) => (m === 'reject' ? 'view' : 'reject'))}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
                    >
                      <XCircle className="h-5 w-5" aria-hidden="true" />
                      <span>{mode === 'reject' ? 'Cancel Reject' : 'Reject'}</span>
                    </button>
                  </div>
                  <p className="text-xs font-medium text-slate-600">
                    Shortcuts: A approve · E edit · R reject · J/K next/prev
                  </p>
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
                      className="rounded-xl bg-blue-600 px-5 py-3 text-base font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
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
                      className="rounded-xl bg-red-600 px-5 py-3 text-base font-bold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
                    >
                      Confirm Reject &amp; Log
                    </button>
                  </form>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto max-w-sm overflow-hidden rounded-2xl">
                  <img
                    src="/img/empty-queue.webp"
                    alt="Calm counselor sipping chai at a tidy desk with an empty inbox tray"
                    loading="lazy"
                    width={600}
                    height={400}
                    className="h-auto w-full object-contain"
                  />
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  All clear
                </span>
                <h2 className="mt-2 text-2xl font-extrabold text-slate-950">
                  No students need manual review right now
                </h2>
                <p className="mt-1 text-base text-slate-700">
                  Every exception has been cleared. New high-risk files will appear here automatically.
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
                  className="rounded-xl bg-blue-600 px-5 py-3 text-base font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
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
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-slate-900">
                        <span>
                          {entry.action} — {entry.actor}
                          {entry.caseId ? ` (${entry.caseId})` : ''}
                          {' · '}
                          <span className="font-mono text-xs font-normal text-slate-600">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700">{entry.details}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* RECENTLY CLEARED CASES (last 3 only) */}
            {queue && queue.resolved.length > 0 && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-bold text-slate-950">Recently Cleared</h2>
                  <span className="text-xs font-medium text-slate-600">
                    Showing last {Math.min(3, queue.resolved.length)} of {queue.resolved.length}
                  </span>
                </div>
                <ul className="mt-3 space-y-2.5 text-sm">
                  {queue.resolved.slice(0, 3).map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-950">
                            {c.consent?.typedSignature || 'Student'}
                          </span>
                          <code
                            title={c.id}
                            className="rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-700 ring-1 ring-slate-200"
                          >
                            <span className="sr-only">{c.id}</span>
                            <span aria-hidden="true">{shortTail(c.id)}</span>
                          </code>
                          <button
                            type="button"
                            onClick={() => void handleCopy(c.id, `cleared-case-${c.id}`)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {copiedKey === `cleared-case-${c.id}` ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 text-slate-500" aria-hidden="true" />
                                <span>Copy ID</span>
                              </>
                            )}
                          </button>
                        </div>
                        {c.approvalTokenId && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                            <span className="font-semibold">Token:</span>
                            <code
                              title={c.approvalTokenId}
                              className="rounded bg-white px-2 py-0.5 font-mono font-semibold text-slate-900 ring-1 ring-slate-200"
                            >
                              <span className="sr-only">{c.approvalTokenId}</span>
                              <span aria-hidden="true">{shortTail(c.approvalTokenId)}</span>
                            </code>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(c.approvalTokenId!, `cleared-token-${c.id}`)
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                            >
                              {copiedKey === `cleared-token-${c.id}` ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 text-slate-600" aria-hidden="true" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                            <span className="text-slate-500">· Approved by {c.approvedBy}</span>
                          </div>
                        )}
                        {c.rejectedReason && (
                          <p className="text-sm text-red-800">Reason: {c.rejectedReason}</p>
                        )}
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                          c.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-red-100 text-red-900'
                        }`}
                      >
                        {c.status === 'approved' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* SMALL FOOTER ROW: INPUT / OUTPUT TOKENS & QUEUE AI COST */}
            {queue && (
              <footer
                aria-label="Queue usage and AI cost summary"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-xs font-medium text-slate-700"
              >
                <span className="font-semibold text-slate-800">Queue AI usage</span>
                <div className="flex flex-wrap items-center gap-4 font-mono">
                  <span>
                    Input tokens:{' '}
                    <strong className="text-slate-950">
                      {[...queue.exceptions, ...queue.greenBatch, ...queue.resolved]
                        .reduce((s, c) => s + (c.usageSummary?.totalInputTokens || 0), 0)
                        .toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Output tokens:{' '}
                    <strong className="text-slate-950">
                      {[...queue.exceptions, ...queue.greenBatch, ...queue.resolved]
                        .reduce((s, c) => s + (c.usageSummary?.totalOutputTokens || 0), 0)
                        .toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Queue AI cost:{' '}
                    <strong className="text-slate-950">${totalEstimatedUsd.toFixed(4)}</strong>
                  </span>
                </div>
              </footer>
            )}
          </div>
        )}
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-700 sm:px-6 lg:px-8">
        AI for speed. Code for money. Humans for the final yes.
      </footer>
    </div>
  );
}
