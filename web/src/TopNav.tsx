import { Check, ChevronRight } from 'lucide-react';

interface TopNavProps {
  activeRoute: 'student' | 'counselor' | 'portal';
  onNavigate: (route: 'student' | 'counselor' | 'portal') => void;
  /** Optional: mark Step 1 complete when student is already viewing Results */
  checkCompleted?: boolean;
  /** Optional: mark Step 2 complete after counselor issues a token */
  approveCompleted?: boolean;
  /** Optional: mark Step 3 complete after portal submits */
  submitCompleted?: boolean;
}

const STEPS: Array<{
  num: 1 | 2 | 3;
  route: 'student' | 'counselor' | 'portal';
  navLabel: string;
  pathLabel: string;
  iconSrc: string;
  iconAlt: string;
}> = [
  {
    num: 1,
    route: 'student',
    navLabel: '1. Check',
    pathLabel: 'Check documents',
    iconSrc: '/img/step-check.webp',
    iconAlt: 'Document check icon',
  },
  {
    num: 2,
    route: 'counselor',
    navLabel: '2. Approve',
    pathLabel: 'Counselor approves',
    iconSrc: '/img/step-approve.webp',
    iconAlt: 'Counselor approval stamp icon',
  },
  {
    num: 3,
    route: 'portal',
    navLabel: '3. University portal',
    pathLabel: 'Agent submits',
    iconSrc: '/img/step-submit.webp',
    iconAlt: 'Application submit icon',
  },
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
    <div className="sticky top-0 z-40">
      {/* PRIMARY HEADER */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => onNavigate('student')}
            className="flex items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            <img
              src="/assets/aira-logo.jpg"
              alt="Aira Application Agent logo"
              className="h-10 w-10 rounded-xl border border-slate-200 object-cover shadow-sm"
            />
            <div>
              <span className="block text-lg font-extrabold tracking-tight text-indigo-950">
                Aira
              </span>
              <span className="block text-xs font-medium text-slate-700">
                Catch visa-refusal mistakes before you apply
              </span>
            </div>
          </button>

          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
            {STEPS.map((s) => {
              const isActive = activeRoute === s.route;
              const activeClass =
                s.route === 'student'
                  ? 'bg-indigo-900 text-white shadow-sm'
                  : s.route === 'counselor'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-blue-600 text-white shadow-sm';
              return (
                <button
                  key={s.route}
                  type="button"
                  onClick={() => onNavigate(s.route)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                    isActive
                      ? activeClass
                      : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span>{s.navLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* STICKY 3-STEP JUDGE PATH BAR */}
      <nav
        aria-label="3-step application workflow"
        className="border-b border-indigo-100 bg-indigo-50/95 backdrop-blur-md"
      >
        <div className="mx-auto max-w-5xl px-4 py-2 sm:px-6 lg:px-8">
          {/* Mobile (<640px): compact "Step X of 3" bar */}
          <div className="flex items-center justify-between gap-2 sm:hidden">
            <span className="text-xs font-extrabold uppercase tracking-wide text-indigo-900">
              Step {activeStep.num} of 3 · {activeStep.pathLabel}
            </span>
            <div className="flex items-center gap-1.5">
              {STEPS.map((s) => {
                const isCurrent = activeRoute === s.route;
                const done = isStepDone(s.num);
                return (
                  <button
                    key={s.route}
                    type="button"
                    onClick={() => onNavigate(s.route)}
                    aria-label={`Go to step ${s.num}: ${s.pathLabel}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                      isCurrent
                        ? 'bg-indigo-900 text-white shadow-sm'
                        : done
                          ? 'bg-emerald-600 text-white'
                          : 'border border-indigo-200 bg-white text-indigo-900'
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
          </div>

          {/* Tablet/Desktop (>=640px): full 3-step clickable path */}
          <ol className="hidden items-center justify-between gap-2 sm:flex">
            {STEPS.map((s, idx) => {
              const isCurrent = activeRoute === s.route;
              const done = isStepDone(s.num);
              return (
                <li key={s.route} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate(s.route)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                      isCurrent
                        ? 'bg-white font-bold text-indigo-950 shadow-sm ring-2 ring-indigo-900/20'
                        : done
                          ? 'bg-emerald-50/90 font-semibold text-emerald-950 hover:bg-emerald-100/80'
                          : 'text-slate-700 hover:bg-white/70'
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                        done && !isCurrent
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                            ? 'bg-indigo-900 text-white'
                            : 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {done && !isCurrent ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        s.num
                      )}
                    </span>
                    <img
                      src={s.iconSrc}
                      alt={s.iconAlt}
                      loading="lazy"
                      className="h-6 w-6 shrink-0 rounded-md object-contain"
                    />
                    <span className="truncate text-sm">
                      <span className="sr-only">Step {s.num}: </span>
                      {s.pathLabel}
                    </span>
                    {done && !isCurrent && (
                      <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        Done
                      </span>
                    )}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-indigo-400"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </nav>
    </div>
  );
}
