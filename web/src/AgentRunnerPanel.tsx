import { useEffect, useState, type FormEvent } from 'react';
import { Bot, ExternalLink, Globe, Play, RefreshCw, ShieldCheck } from 'lucide-react';

interface GroundedSource {
  title: string;
  url: string;
}

interface UniversityRulesResult {
  universityName: string;
  programName: string;
  modelUsed: string;
  fallbackUsed: boolean;
  summaryMarkdown: string;
  sources: GroundedSource[];
  portalWarning?: string;
}

interface AgentStepFeedItem {
  stepNumber: number;
  timestamp: string;
  modelUsed: string;
  action: string;
  intent: string;
  url: string;
  status: 'ok' | 'blocked' | 'error' | 'escalated' | 'paused';
  note?: string;
  thumbnailDataUrl?: string;
}

interface AgentRunRecord {
  id: string;
  caseId: string;
  portalUrl: string;
  status: string;
  currentModel: string;
  stepCount: number;
  statusMessage: string;
  submissionReference?: string;
  steps: AgentStepFeedItem[];
}

interface AgentRunnerPanelProps {
  caseId: string;
  onOpenCounselor: () => void;
  onOpenPortal: () => void;
}

export default function AgentRunnerPanel({
  caseId,
  onOpenCounselor,
  onOpenPortal,
}: AgentRunnerPanelProps) {
  // University rules grounding (gemini-4-neon + Search + URL context)
  const [uniName, setUniName] = useState('University of Manchester');
  const [programName, setProgramName] = useState('MSc Data Science');
  const [uniUrl, setUniUrl] = useState('');
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesResult, setRulesResult] = useState<UniversityRulesResult | null>(null);

  // Computer-use agent launcher
  const [studentEmail, setStudentEmail] = useState('arun.applicant@example.com');
  const [studentPhone, setStudentPhone] = useState('+91-9876543210');
  const [portalUrl, setPortalUrl] = useState('/portal');
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<AgentRunRecord | null>(null);

  async function handleLookupRules(e: FormEvent) {
    e.preventDefault();
    setRulesLoading(true);
    setRulesError(null);
    try {
      const res = await fetch('/api/university-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityName: uniName.trim(),
          programName: programName.trim(),
          url: uniUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Rules lookup failed.');
      setRulesResult(data as UniversityRulesResult);
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : 'Failed to fetch rules.');
    } finally {
      setRulesLoading(false);
    }
  }

  async function handleLaunchAgent(e: FormEvent) {
    e.preventDefault();
    setLaunchLoading(true);
    setLaunchError(null);
    try {
      const res = await fetch('/api/agent/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          studentEmail: studentEmail.trim(),
          studentPhone: studentPhone.trim(),
          portalUrl: portalUrl.trim() || '/portal',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Could not launch agent.');
      setActiveRun(data.run as AgentRunRecord);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Failed to launch agent.');
    } finally {
      setLaunchLoading(false);
    }
  }

  async function handleResumeRun(safetyAcknowledged = false) {
    if (!activeRun) return;
    setLaunchLoading(true);
    setLaunchError(null);
    try {
      const res = await fetch(`/api/agent/runs/${activeRun.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safetyAcknowledged }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Resume failed.');
      setActiveRun((prev) =>
        prev ? { ...prev, status: 'queued', statusMessage: 'Resuming via Cloud Tasks...' } : prev
      );
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Resume failed.');
    } finally {
      setLaunchLoading(false);
    }
  }

  // Live poll Firestore-backed run record every 2.5 seconds while active
  useEffect(() => {
    if (!activeRun) return;
    if (!['queued', 'running'].includes(activeRun.status)) return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/agent/runs/${activeRun.id}`);
        if (res.ok) {
          const updated = (await res.json()) as AgentRunRecord;
          setActiveRun(updated);
        }
      } catch {
        // retry on next tick
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [activeRun?.id, activeRun?.status]);

  return (
    <div className="space-y-6">
      {/* UNIVERSITY RULES GROUNDING (gemini-4-neon + Search + URL context) */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-800">
            <Globe className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-950">
              Live University Rules Lookup
            </h2>
            <p className="text-sm text-slate-600">
              Reads official university requirements with{' '}
              <span className="font-mono font-semibold">gemini-4-neon</span> + Google Search + URL Context.
            </p>
          </div>
        </div>

        <form onSubmit={handleLookupRules} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ur-name" className="block text-sm font-semibold">University name</label>
              <input
                id="ur-name"
                type="text"
                value={uniName}
                onChange={(e) => setUniName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base"
              />
            </div>
            <div>
              <label htmlFor="ur-prog" className="block text-sm font-semibold">Programme name</label>
              <input
                id="ur-prog"
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ur-url" className="block text-sm font-semibold">
              Optional official requirements page URL
            </label>
            <input
              id="ur-url"
              type="url"
              value={uniUrl}
              onChange={(e) => setUniUrl(e.target.value)}
              placeholder="https://www.manchester.ac.uk/..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base"
            />
          </div>
          <button
            type="submit"
            disabled={rulesLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-base font-bold text-white shadow-sm hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:opacity-50"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            <span>{rulesLoading ? 'Checking official university pages...' : 'Check Official Rules'}</span>
          </button>
        </form>

        {rulesError && (
          <div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">
            {rulesError}
          </div>
        )}

        {rulesResult && (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-600">
              Grounded by {rulesResult.modelUsed}
            </p>
            {rulesResult.portalWarning && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                {rulesResult.portalWarning}
              </p>
            )}
            <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-900">
              {rulesResult.summaryMarkdown}
            </div>
            {rulesResult.sources.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <p className="text-sm font-bold text-slate-800">Official Source Links</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {rulesResult.sources.map((src, i) => (
                    <li key={i}>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 underline break-all"
                      >
                        {src.title || src.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* APPLICATION AGENT LAUNCHER & LIVE STEP FEED */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-slate-950 sm:text-2xl">
                Application Agent: Gemini fills the portal, stops before Submit until a counselor approves
              </h2>
              <p className="mt-0.5 text-sm text-slate-700">
                Uses your verified facts only. Never automates Common App or UCAS.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPortal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span>Open University portal</span>
          </button>
        </div>

        <form onSubmit={handleLaunchAgent} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ag-email" className="block text-sm font-semibold text-slate-800">Student email</label>
              <input
                id="ag-email"
                type="email"
                required
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>
            <div>
              <label htmlFor="ag-phone" className="block text-sm font-semibold text-slate-800">Student phone</label>
              <input
                id="ag-phone"
                type="tel"
                required
                value={studentPhone}
                onChange={(e) => setStudentPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ag-url" className="block text-sm font-semibold text-slate-800">
              University portal destination (pre-configured for the live Sample University portal)
            </label>
            <input
              id="ag-url"
              type="text"
              value={portalUrl}
              onChange={(e) => setPortalUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
          </div>

          <button
            type="submit"
            disabled={launchLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-lg font-bold text-white shadow-md hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:opacity-50"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            <span>{launchLoading ? 'Starting Application Agent...' : 'Start Application Agent'}</span>
          </button>
        </form>

        {launchError && (
          <div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">
            {launchError}
          </div>
        )}

        {activeRun && (
          <div className="mt-5 space-y-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-slate-600">
                  Run ID: {activeRun.id} · Model: {activeRun.currentModel} · Steps:{' '}
                  {activeRun.stepCount}
                </p>
                <p className="mt-1 text-lg font-bold text-slate-950">{activeRun.statusMessage}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  activeRun.status === 'submitted'
                    ? 'bg-emerald-700 text-white'
                    : activeRun.status.startsWith('paused') || activeRun.status === 'escalated_to_counselor'
                      ? 'bg-amber-700 text-white'
                      : activeRun.status === 'failed'
                        ? 'bg-red-700 text-white'
                        : 'bg-blue-700 text-white'
                }`}
              >
                {activeRun.status.replace(/_/g, ' ')}
              </span>
            </div>

            {activeRun.submissionReference && (
              <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 font-mono text-base font-bold text-emerald-950">
                Submitted cleanly — Reference: {activeRun.submissionReference}
              </p>
            )}

            {(activeRun.status === 'paused_needs_approval' ||
              activeRun.status === 'paused_safety_confirmation' ||
              activeRun.status === 'paused_captcha_or_otp') && (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onOpenCounselor}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-base font-bold text-white hover:bg-amber-800"
                >
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  <span>Open Counselor Queue to Approve</span>
                </button>
                <button
                  type="button"
                  disabled={launchLoading}
                  onClick={() =>
                    void handleResumeRun(activeRun.status === 'paused_safety_confirmation')
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-base font-bold text-white hover:bg-emerald-800"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>Resume Agent After Approval</span>
                </button>
              </div>
            )}

            {/* LIVE STEP FEED WITH THUMBNAILS */}
            {activeRun.steps.length > 0 && (
              <ol className="space-y-3">
                {activeRun.steps.map((s) => (
                  <li
                    key={s.stepNumber}
                    className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:grid-cols-3"
                  >
                    {s.thumbnailDataUrl && (
                      <img
                        src={s.thumbnailDataUrl}
                        alt={`Step ${s.stepNumber}: ${s.action}`}
                        className="w-full rounded-lg border border-slate-200 object-cover"
                      />
                    )}
                    <div className={s.thumbnailDataUrl ? 'sm:col-span-2' : 'sm:col-span-3'}>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-900">
                          Step {s.stepNumber}
                        </span>
                        <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-blue-900">
                          {s.action}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-700">
                          {s.modelUsed}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 uppercase ${
                            s.status === 'blocked' || s.status === 'error'
                              ? 'bg-red-100 text-red-900'
                              : s.status === 'escalated'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-base font-medium text-slate-950">{s.intent}</p>
                      {s.note && <p className="mt-1 text-sm text-slate-700">{s.note}</p>}
                      <p className="mt-1 truncate font-mono text-xs text-slate-500">{s.url}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
