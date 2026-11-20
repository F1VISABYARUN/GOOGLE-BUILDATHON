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
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        {/* Left: Aira logo + optional Demo data pill (only on sample run) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('student')}
            className="flex items-center gap-2 rounded-[8px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
          >
            <img
              src="/assets/aira-logo.jpg"
              alt="Aira logo"
              className="h-8 w-8 rounded-[8px] border border-gray-200 object-cover"
            />
            <span className="text-[18px] font-bold tracking-tight text-gray-900">Aira</span>
          </button>
          {showDemoPill && (
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[14px] font-medium text-gray-600">
              Demo data
            </span>
          )}
        </div>

        {/* Centre: Stepper (1 Check · 2 Approve · 3 Submit) */}
        <nav aria-label="Application progress" className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((s, idx) => {
            const isCurrent = activeRoute === s.route;
            const done = isStepDone(s.num);
            return (
              <div key={s.route} className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate(s.route)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] ${
                    isCurrent
                      ? 'bg-[#1A73E8] text-white'
                      : done
                        ? 'bg-[#E6F4EA] text-[#188038]'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {done && !isCurrent && (
                    <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
                      check_circle
                    </span>
                  )}
                  <span>{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <span className="text-[14px] text-gray-400" aria-hidden="true">
                    ·
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        {/* Right: Counselor view link (or Approving as input on Counselor route) */}
        <div className="flex items-center gap-3">
          {activeRoute === 'counselor' && onCounselorNameChange ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor="active-counselor-name"
                className="text-[14px] font-medium text-gray-900"
              >
                Approving as:
              </label>
              <input
                id="active-counselor-name"
                type="text"
                value={counselorName || ''}
                onChange={(e) => onCounselorNameChange(e.target.value)}
                placeholder="Counselor name"
                className="h-9 w-40 rounded-[8px] border border-gray-300 bg-white px-2.5 text-[14px] font-medium text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30 sm:w-44"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('counselor')}
              className="inline-flex h-9 items-center gap-1 rounded-[8px] px-2.5 text-[14px] font-semibold text-[#1A73E8] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
            >
              <span>Counselor view</span>
              <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                arrow_forward
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
