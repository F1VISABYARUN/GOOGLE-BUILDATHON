import { Check, ChevronRight, ExternalLink } from 'lucide-react';

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
  pathLabel: string;
  iconSrc: string;
  iconAlt: string;
}> = [
  {
    num: 1,
    route: 'student',
    pathLabel: 'Check documents',
    iconSrc: '/img/step-check.webp',
    iconAlt: 'Document check icon',
  },
  {
    num: 2,
    route: 'counselor',
    pathLabel: 'Counselor approves',
    iconSrc: '/img/step-approve.webp',
    iconAlt: 'Counselor approval icon',
  },
  {
    num: 3,
    route: 'portal',
    pathLabel: 'University portal',
    iconSrc: '/img/step-submit.webp',
    iconAlt: 'University portal submit icon',
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
    <div className="sticky top-0 z-40 shadow-xs">
      {/* SINGLE CLEAN TOP BAR */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('student')}
              className="flex items-center gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
            >
              <img
                src="/assets/aira-logo.jpg"
                alt="Aira logo"
                className="h-9 w-9 rounded-xl border border-slate-200 object-cover"
              />
              <span className="text-lg font-extrabold tracking-tight text-indigo-950">
                Aira
              </span>
            </button>
            <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 sm:inline-flex">
              Demo mode · sample data only
            </span>
          </div>

          <a
            href="https://airaai.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-bold text-indigo-900 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 sm:text-sm"
          >
            <span>Ask Aira 24/7 (airaai.io)</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      {/* ONE UNIFIED STICKY 3-STEP WORKFLOW BAR */}
      <nav
        aria-label="3-step application workflow"
        className="border-b border-slate-200 bg-slate-50/95 backdrop-blur-md"
      >
        <div className="mx-auto max-w-5xl px-4 py-2 sm:px-6 lg:px-8">
          {/* Mobile (<640px): compact "Step X of 3" */}
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
                    aria-label={`Step ${s.num}: ${s.pathLabel}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                      isCurrent
                        ? 'bg-indigo-900 text-white shadow-sm'
                        : done
                          ? 'bg-emerald-600 text-white'
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
          </div>

          {/* Desktop (>=640px): 3 clickable steps */}
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
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                      isCurrent
                        ? 'bg-white font-bold text-indigo-950 shadow-sm ring-2 ring-indigo-600/25'
                        : done
                          ? 'bg-emerald-50/80 font-semibold text-emerald-950 hover:bg-emerald-100/80'
                          : 'text-slate-700 hover:bg-white'
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
                      className="h-5 w-5 shrink-0 object-contain"
                    />
                    <span className="truncate text-sm">{s.pathLabel}</span>
                    {done && !isCurrent && (
                      <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        Done
                      </span>
                    )}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-slate-400"
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
