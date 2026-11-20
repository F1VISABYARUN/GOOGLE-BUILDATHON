import { Check } from 'lucide-react';

interface TopNavProps {
  activeRoute: 'student' | 'counselor' | 'portal';
  onNavigate: (route: 'student' | 'counselor' | 'portal') => void;
  checkCompleted?: boolean;
  approveCompleted?: boolean;
  submitCompleted?: boolean;
}

const STEPS: Array<{
  num: 1 | 2 | 3;
  route: 'student' | 'counselor' | 'portal';
  label: string;
}> = [
  { num: 1, route: 'student', label: '1. Check' },
  { num: 2, route: 'counselor', label: '2. Approve' },
  { num: 3, route: 'portal', label: '3. University portal' },
];

export default function TopNav({
  activeRoute,
  onNavigate,
  checkCompleted = false,
  approveCompleted = false,
  submitCompleted = false,
}: TopNavProps) {
  const activeIdx = activeRoute === 'student' ? 0 : activeRoute === 'counselor' ? 1 : 2;
  const activeStep = STEPS[activeIdx];

  function isStepDone(num: 1 | 2 | 3): boolean {
    if (num === 1) return checkCompleted || activeIdx > 0;
    if (num === 2) return approveCompleted || activeIdx > 1;
    return submitCompleted;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Left: Brand + Demo pill */}
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('student')}
            className="flex items-center gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            <img
              src="/assets/aira-logo.jpg"
              alt="Aira logo"
              className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
            />
            <span className="text-lg font-extrabold tracking-tight text-slate-950">Aira</span>
          </button>
          <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 lg:inline-flex">
            Demo mode · sample data only
          </span>
        </div>

        {/* Center (Desktop >=640px): ONE step tracker — 3 header pills */}
        <nav aria-label="Application steps" className="hidden items-center gap-1.5 sm:flex">
          {STEPS.map((s) => {
            const isCurrent = activeRoute === s.route;
            const done = isStepDone(s.num);
            return (
              <button
                key={s.route}
                type="button"
                onClick={() => onNavigate(s.route)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                  isCurrent
                    ? 'bg-blue-600 text-white shadow-xs'
                    : done
                      ? 'border border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                      : 'border border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {done && !isCurrent && (
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                )}
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mobile (<640px): compact Step X of 3 + circular jump buttons */}
        <nav aria-label="Application steps" className="flex items-center gap-2 sm:hidden">
          <span className="text-xs font-bold text-slate-800">Step {activeStep.num} of 3</span>
          <div className="flex items-center gap-1">
            {STEPS.map((s) => {
              const isCurrent = activeRoute === s.route;
              const done = isStepDone(s.num);
              return (
                <button
                  key={s.route}
                  type="button"
                  onClick={() => onNavigate(s.route)}
                  aria-label={s.label}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                    isCurrent
                      ? 'bg-blue-600 text-white'
                      : done
                        ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {done && !isCurrent ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    s.num
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right: Counselor link (secondary outline) */}
        <button
          type="button"
          onClick={() => onNavigate('counselor')}
          className="hidden shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 md:inline-flex"
        >
          <span>Are you a counselor? →</span>
        </button>
      </div>
    </header>
  );
}
