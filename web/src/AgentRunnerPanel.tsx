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
    <div className="space-y-4 border-t border-gray-200 pt-5">
      <div>
        <h3 className="text-[16px] font-semibold text-gray-900">
          Look up official university entry rules (Google Search + URL Context)
        </h3>
        <p className="mt-0.5 text-[14px] text-gray-600">
          Reads official university pages live with citations.
        </p>
      </div>

      <form onSubmit={handleLookupRules} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="ur-name" className="block text-[14px] font-medium text-gray-900">
            University
          </label>
          <input
            id="ur-name"
            type="text"
            value={uniName}
            onChange={(e) => setUniName(e.target.value)}
            className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
          />
        </div>
        <div>
          <label htmlFor="ur-prog" className="block text-[14px] font-medium text-gray-900">
            Course
          </label>
          <input
            id="ur-prog"
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
          />
        </div>
        <div>
          <label htmlFor="ur-url" className="block text-[14px] font-medium text-gray-900">
            Course page URL (optional)
          </label>
          <input
            id="ur-url"
            type="url"
            value={uniUrl}
            onChange={(e) => setUniUrl(e.target.value)}
            placeholder="https://www.manchester.ac.uk/..."
            className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
          />
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={rulesLoading}
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] disabled:opacity-50"
          >
            <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
              travel_explore
            </span>
            <span>{rulesLoading ? 'Checking official pages...' : 'Check official rules'}</span>
          </button>
        </div>
      </form>

      {rulesError && (
        <p role="alert" className="text-[14px] font-medium text-[#D93025]">
          {rulesError}
        </p>
      )}

      {rulesResult && (
        <div className="space-y-3 border-t border-gray-200 pt-4 text-[14px]">
          <p className="font-mono text-[14px] text-gray-600">
            Model: {rulesResult.modelUsed}
          </p>
          {rulesResult.portalWarning && (
            <p className="text-[14px] font-medium text-[#B06000]">
              {rulesResult.portalWarning}
            </p>
          )}
          <div className="whitespace-pre-wrap leading-relaxed text-gray-900">
            {rulesResult.summaryMarkdown}
          </div>
          {rulesResult.sources.length > 0 && (
            <ul className="space-y-1 border-t border-gray-200 pt-2 text-[14px]">
              {rulesResult.sources.map((src, i) => (
                <li key={i}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-[#1A73E8] underline"
                  >
                    {src.title || src.url}
                  </a>
                </li>
              ))}
            </ul>
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
    <section className="rounded-[12px] border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-bold text-gray-900">
            University application draft
          </h3>
          <p className="mt-1 text-[14px] text-gray-600">
            Fills the portal with your checked details and stops before Submit until a counselor approves.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPortal}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[8px] px-2.5 text-[14px] font-semibold text-[#1A73E8] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
        >
          <span>Open portal</span>
          <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
            open_in_new
          </span>
        </button>
      </div>

      <form onSubmit={handleLaunchAgent} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ag-email" className="block text-[14px] font-medium text-gray-900">
              Applicant email
            </label>
            <input
              id="ag-email"
              type="email"
              required
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
            />
          </div>
          <div>
            <label htmlFor="ag-phone" className="block text-[14px] font-medium text-gray-900">
              Applicant phone
            </label>
            <input
              id="ag-phone"
              type="tel"
              required
              value={studentPhone}
              onChange={(e) => setStudentPhone(e.target.value)}
              className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
            />
          </div>
        </div>

        {/* Secondary outline button so Results has strictly ONE primary button ("Send to counselor") */}
        <button
          type="submit"
          disabled={launchLoading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-gray-300 bg-white px-4 text-[16px] font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] disabled:opacity-50"
        >
          <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
            smart_toy
          </span>
          <span>
            {launchLoading ? 'Preparing draft...' : 'Pre-fill university form'}
          </span>
          <span className="sr-only">Start Application Agent</span>
        </button>
      </form>

      {launchError && (
        <p role="alert" className="mt-3 text-[14px] font-medium text-[#D93025]">
          {launchError}
        </p>
      )}

      {activeRun && (
        <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[16px] font-semibold text-gray-900">{activeRun.statusMessage}</p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[14px] font-semibold ${
                activeRun.status === 'submitted'
                  ? 'bg-[#E6F4EA] text-[#188038]'
                  : activeRun.status === 'failed'
                    ? 'bg-[#FCE8E6] text-[#D93025]'
                    : 'bg-[#FEF7E0] text-[#B06000]'
              }`}
            >
              {activeRun.status.replace(/_/g, ' ')}
            </span>
          </div>

          {activeRun.submissionReference && (
            <p className="text-[14px] font-semibold text-[#188038]">
              Submitted — Reference: {activeRun.submissionReference}
            </p>
          )}

          {(activeRun.status === 'paused_needs_approval' ||
            activeRun.status === 'paused_safety_confirmation' ||
            activeRun.status === 'paused_captcha_or_otp') && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenCounselor}
                className="inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50"
              >
                <span>Open counselor view</span>
              </button>
              <button
                type="button"
                disabled={launchLoading}
                onClick={() =>
                  void handleResumeRun(activeRun.status === 'paused_safety_confirmation')
                }
                className="inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50"
              >
                <span>Resume after approval</span>
              </button>
            </div>
          )}

          {activeRun.steps.length > 0 && (
            <ol className="space-y-2 border-t border-gray-200 pt-3">
              {activeRun.steps.map((s) => (
                <li key={s.stepNumber} className="text-[14px] text-gray-600">
                  <strong className="text-gray-900">{s.intent}</strong>
                  {s.note ? ` — ${s.note}` : ''}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
