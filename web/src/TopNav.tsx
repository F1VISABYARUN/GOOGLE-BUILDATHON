import { FileCheck2, ShieldCheck, GraduationCap } from 'lucide-react';

interface TopNavProps {
  activeRoute: 'student' | 'counselor' | 'portal';
  onNavigate: (route: 'student' | 'counselor' | 'portal') => void;
}

export default function TopNav({ activeRoute, onNavigate }: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
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
            <span className="block text-lg font-extrabold tracking-tight text-slate-950">
              Aira Application Agent
            </span>
            <span className="block text-xs font-medium text-slate-600">
              Verified Facts · Plain-Code Checks · Human Approval
            </span>
          </div>
        </button>

        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('student')}
            aria-current={activeRoute === 'student' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
              activeRoute === 'student'
                ? 'bg-slate-950 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
            }`}
          >
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            <span>Student Check</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('counselor')}
            aria-current={activeRoute === 'counselor' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
              activeRoute === 'counselor'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Counselor Queue</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('portal')}
            aria-current={activeRoute === 'portal' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 ${
              activeRoute === 'portal'
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'border border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
            }`}
          >
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            <span>Direct /portal</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
