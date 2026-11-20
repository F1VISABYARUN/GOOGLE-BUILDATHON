import { useEffect, useState, type FormEvent } from 'react';

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

export function UniversityRulesLookup() {
  const [uniName, setUniName] = useState('University of Manchester');
  const [programName, setProgramName] = useState('MSc Data Science');
  const [uniUrl, setUniUrl] = useState('');
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesResult, setRulesResult] = useState<UniversityRulesResult | null>(null);

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

  return (
    <div className="space-y-4 border-t border-slate-200/80 pt-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
          <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
            travel_explore
          </span>
        </span>
        <div>
          <h3 className="font-display text-[17px] font-bold tracking-tight text-slate-950">
            Official university entry rules
          </h3>
          <p className="mt-0.5 text-[14px] text-slate-600">
            Reads live official course pages via Google Search and URL Context with direct citations.
          </p>
        </div>
      </div>

      <form onSubmit={handleLookupRules} className="grid gap-3.5 sm:grid-cols-3">
        <div>
          <label htmlFor="ur-name" className="block text-[13px] font-semibold text-slate-700">
            University
          </label>
          <input
            id="ur-name"
            type="text"
            value={uniName}
            onChange={(e) => setUniName(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
          />
        </div>
        <div>
          <label htmlFor="ur-prog" className="block text-[13px] font-semibold text-slate-700">
            Course
          </label>
          <input
            id="ur-prog"
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
          />
        </div>
        <div>
          <label htmlFor="ur-url" className="block text-[13px] font-semibold text-slate-700">
            Course page URL (optional)
          </label>
          <input
            id="ur-url"
            type="url"
            value={uniUrl}
            onChange={(e) => setUniUrl(e.target.value)}
            placeholder="https://www.manchester.ac.uk/..."
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
          />
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={rulesLoading}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-[14px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50"
          >
            <span className="material-symbols-outlined !text-[18px] text-[#2563EB]" aria-hidden="true">
              {rulesLoading ? 'progress_activity' : 'travel_explore'}
            </span>
            <span>{rulesLoading ? 'Checking official pages...' : 'Check official rules'}</span>
          </button>
        </div>
      </form>

      {rulesError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-medium text-red-700"
        >
          <span className="material-symbols-outlined mt-0.5 !text-[18px]" aria-hidden="true">
            error
          </span>
          <span>{rulesError}</span>
        </div>
      )}

      {rulesResult && (
        <div className="space-y-3 rounded-xl border border-slate-200/80 bg-[#FAF9F6] p-4 text-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-900">
              {rulesResult.universityName} · {rulesResult.programName}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[12px] font-medium text-slate-600">
              {rulesResult.modelUsed}
            </span>
          </div>
          {rulesResult.portalWarning && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              {rulesResult.portalWarning}
            </p>
          )}
          <div className="whitespace-pre-wrap leading-relaxed text-slate-800">
            {rulesResult.summaryMarkdown}
          </div>
          {rulesResult.sources.length > 0 && (
            <div className="border-t border-slate-200/80 pt-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Grounded sources
              </p>
              <ul className="mt-1.5 space-y-1.5 text-[13px]">
                {rulesResult.sources.map((src, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span
                      className="material-symbols-outlined mt-0.5 !text-[15px] text-[#2563EB]"
                      aria-hidden="true"
                    >
                      link
                    </span>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-medium text-[#2563EB] underline decoration-blue-300 underline-offset-2 hover:text-[#1D4ED8]"
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
    </div>
  );
}

export default function AgentRunnerPanel({
  caseId,
  onOpenCounselor,
  onOpenPortal,
}: AgentRunnerPanelProps) {
  const [studentEmail, setStudentEmail] = useState('arun.applicant@example.com');
  const [studentPhone, setStudentPhone] = useState('+91-9876543210');
  const portalUrl = '/portal';
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<AgentRunRecord | null>(null);

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
          portalUrl,
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
        prev ? { ...prev, status: 'queued', statusMessage: 'Resuming application draft...' } : prev
      );
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Resume failed.');
    } finally {
      setLaunchLoading(false);
    }
  }

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
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
            <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
              smart_toy
            </span>
          </span>
          <div>
            <h3 className="font-display text-[18px] font-bold tracking-tight text-slate-950">
              University application draft
            </h3>
            <p className="mt-0.5 text-[14px] leading-relaxed text-slate-600">
              Pre-fills the portal with your verified details and pauses before Submit until a human
              counselor approves.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenPortal}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-[#FAF9F6] px-3.5 text-[13px] font-semibold text-[#2563EB] transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          <span>Open portal</span>
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
            open_in_new
          </span>
        </button>
      </div>

      <form onSubmit={handleLaunchAgent} className="mt-5 space-y-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="ag-email" className="block text-[13px] font-semibold text-slate-700">
              Applicant email
            </label>
            <input
              id="ag-email"
              type="email"
              required
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 transition focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
            />
          </div>
          <div>
            <label htmlFor="ag-phone" className="block text-[13px] font-semibold text-slate-700">
              Applicant phone
            </label>
            <input
              id="ag-phone"
              type="tel"
              required
              value={studentPhone}
              onChange={(e) => setStudentPhone(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 transition focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
            />
          </div>
        </div>

        {/* Secondary crisp outline pill button so Results keeps one clear Primary CTA */}
        <button
          type="submit"
          disabled={launchLoading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-[15px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50"
        >
          <span className="material-symbols-outlined !text-[20px] text-[#2563EB]" aria-hidden="true">
            {launchLoading ? 'progress_activity' : 'smart_toy'}
          </span>
          <span>{launchLoading ? 'Preparing draft...' : 'Pre-fill university form'}</span>
          <span className="sr-only">Start Application Agent</span>
        </button>
      </form>

      {launchError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-medium text-red-700"
        >
          <span className="material-symbols-outlined mt-0.5 !text-[18px]" aria-hidden="true">
            error
          </span>
          <span>{launchError}</span>
        </div>
      )}

      {activeRun && (
        <div className="mt-5 space-y-4 rounded-xl border border-slate-200/80 bg-[#FAF9F6] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[15px] font-semibold text-slate-950">{activeRun.statusMessage}</p>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-0.5 text-[12px] font-semibold capitalize ${
                activeRun.status === 'submitted'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : activeRun.status === 'failed'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {activeRun.status.replace(/_/g, ' ')}
            </span>
          </div>

          {activeRun.submissionReference && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[14px] font-semibold text-emerald-800">
              <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                check_circle
              </span>
              <span>
                Submitted — Reference:{' '}
                <code className="font-mono font-bold">{activeRun.submissionReference}</code>
              </span>
            </div>
          )}

          {(activeRun.status === 'paused_needs_approval' ||
            activeRun.status === 'paused_safety_confirmation' ||
            activeRun.status === 'paused_captcha_or_otp') && (
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onOpenCounselor}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#2563EB] px-5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <span>Open counselor workspace</span>
                <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
              <button
                type="button"
                disabled={launchLoading}
                onClick={() =>
                  void handleResumeRun(activeRun.status === 'paused_safety_confirmation')
                }
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-5 text-[14px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50"
              >
                <span>Resume after approval</span>
              </button>
            </div>
          )}

          {activeRun.steps.length > 0 && (
            <ol className="space-y-2 border-t border-slate-200/80 pt-3">
              {activeRun.steps.map((s) => (
                <li
                  key={s.stepNumber}
                  className="flex items-start gap-2.5 text-[14px] text-slate-600"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white font-mono text-[11px] font-semibold text-slate-600">
                    {s.stepNumber}
                  </span>
                  <span>
                    <strong className="font-semibold text-slate-900">{s.intent}</strong>
                    {s.note ? ` — ${s.note}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
