interface TopNavProps {
  activeRoute: 'student' | 'counselor' | 'portal';
  onNavigate: (route: 'student' | 'counselor' | 'portal') => void;
  checkCompleted?: boolean;
  approveCompleted?: boolean;
  submitCompleted?: boolean;
  showDemoPill?: boolean;
  counselorName?: string;
  onCounselorNameChange?: (name: string) => void;
}

const STEPS: Array<{
  num: 1 | 2 | 3;
  route: 'student' | 'counselor' | 'portal';
  label: string;
}> = [
  { num: 1, route: 'student', label: '1 Check' },
  { num: 2, route: 'counselor', label: '2 Approve' },
  { num: 3, route: 'portal', label: '3 Submit' },
];

export default function TopNav({
  activeRoute,
  onNavigate,
  checkCompleted = false,
  approveCompleted = false,
  submitCompleted = false,
  showDemoPill = false,
  counselorName,
  onCounselorNameChange,
}: TopNavProps) {
  const activeIdx = activeRoute === 'student' ? 0 : activeRoute === 'counselor' ? 1 : 2;

  function isStepDone(num: 1 | 2 | 3): boolean {
    if (num === 1) return checkCompleted || activeIdx > 0;
    if (num === 2) return approveCompleted || activeIdx > 1;
    return submitCompleted;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('student')}
            className="flex items-center gap-2.5 rounded-full pr-2 text-left transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <img
              src="/assets/aira-logo.jpg"
              alt="AIRA AI logo"
              className="h-9 w-9 rounded-xl border border-slate-200 object-cover shadow-xs"
            />
            <span className="font-display text-[19px] font-extrabold tracking-tight text-slate-950">
              AIRA <span className="text-[#2563EB]">AI</span>
            </span>
          </button>
          {showDemoPill && (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[13px] font-semibold text-[#2563EB]">
              Sample run
            </span>
          )}
        </div>

        {/* Center: Clean Pill Journey Stepper */}
        <nav
          aria-label="Application progress"
          className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-[#FAF9F6] p-1"
        >
          {STEPS.map((s) => {
            const isCurrent = activeRoute === s.route;
            const done = isStepDone(s.num);
            return (
              <button
                key={s.route}
                type="button"
                onClick={() => onNavigate(s.route)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  isCurrent
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : done
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950'
                }`}
              >
                {done && !isCurrent && (
                  <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">
                    check_circle
                  </span>
                )}
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: First /Counselor/i nav button in DOM (or active approver input on /counselor) */}
        <div className="flex items-center gap-2.5">
          {activeRoute === 'counselor' && onCounselorNameChange ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor="active-counselor-name"
                className="text-[14px] font-semibold text-slate-700"
              >
                Approving as:
              </label>
              <input
                id="active-counselor-name"
                type="text"
                value={counselorName || ''}
                onChange={(e) => onCounselorNameChange(e.target.value)}
                placeholder="Counselor name"
                className="h-10 w-40 rounded-full border border-slate-300 bg-white px-4 text-[14px] font-medium text-slate-950 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 sm:w-44"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('counselor')}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <span>Counselor Workspace</span>
              <span className="material-symbols-outlined !text-[17px] text-[#2563EB]" aria-hidden="true">
                arrow_forward
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
