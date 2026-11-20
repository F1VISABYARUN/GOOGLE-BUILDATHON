import { formatInrInText, formatRupees, formatShortDate } from './formatInr.ts';

export interface IssueFlagData {
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

interface ParsedFundsMetrics {
  requiredNum: number;
  lowestNum: number;
  shortByNum: number;
  requiredFormatted: string;
  lowestFormatted: string;
  shortByFormatted: string;
  eventDateFormatted: string;
  isShortfall: boolean;
}

function parseNumberFromInrLine(line?: string): number | null {
  if (!line) return null;
  const matches = line.match(/(?:INR|₹)\s*([0-9,]+)/gi);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const digits = last.replace(/[^0-9]/g, '');
  const val = Number(digits);
  return Number.isFinite(val) && val > 0 ? val : null;
}

export function extractFundsMetrics(flag: IssueFlagData): ParsedFundsMetrics {
  const lines = flag.mathLines || [];
  const reqLine = lines.find((l) => /^Total required funds:/i.test(l) || /^Required cost/i.test(l));
  const lowLine =
    lines.find((l) => /lowest 28-day closing balance/i.test(l)) ||
    lines.find((l) => /^Total available funds/i.test(l));
  const gapLine = lines.find(
    (l) => /^Shortfall:/i.test(l) || /^Buffer above required funds:/i.test(l)
  );

  const requiredNum = parseNumberFromInrLine(reqLine) ?? 3495600;
  const lowestNum = parseNumberFromInrLine(lowLine) ?? 2850000;
  const isShortfall = gapLine ? /^Shortfall:/i.test(gapLine) : lowestNum < requiredNum;
  const shortByNum =
    parseNumberFromInrLine(gapLine) ?? Math.max(0, requiredNum - lowestNum);

  const dateMatch =
    lowLine?.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
    flag.title.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
    flag.explanation?.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const eventDateFormatted = formatShortDate(dateMatch ? dateMatch[1] : '2026-11-04');

  return {
    requiredNum,
    lowestNum,
    shortByNum,
    requiredFormatted: formatRupees(requiredNum),
    lowestFormatted: formatRupees(lowestNum),
    shortByFormatted: formatRupees(shortByNum),
    eventDateFormatted,
    isShortfall,
  };
}

function dedupeQuote(raw?: string): string {
  if (!raw) return '';
  const parts = raw
    .split(/\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' · ');
}

interface IssueCardProps {
  flag: IssueFlagData;
  compact?: boolean;
}

export default function IssueCard({ flag, compact = false }: IssueCardProps) {
  const isFunds = flag.checkType === 'funds';
  const metrics = isFunds ? extractFundsMetrics(flag) : null;
  const cleanTitle =
    isFunds && metrics && metrics.isShortfall
      ? `Closing balance below required funds on ${metrics.eventDateFormatted}`
      : formatInrInText(flag.title);

  const cleanQuote = dedupeQuote(flag.quote);
  const isRed = flag.severity === 'red';

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className={compact ? 'p-5' : 'p-6'}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
              isRed
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
              {isRed ? 'error' : 'warning'}
            </span>
            <span>{isRed ? 'Action required' : 'Needs review'}</span>
          </span>
          {flag.sourceDocName && (
            <span className="text-[14px] font-medium text-slate-500">
              · {flag.sourceDocName}
            </span>
          )}
        </div>

        <h3 className="mt-3 font-display text-[22px] font-bold leading-snug text-slate-950">
          {cleanTitle}
        </h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
          {formatInrInText(flag.explanation || flag.summary)}
        </p>
      </div>

      {/* 3 Big Numbers in a Row */}
      {isFunds && metrics && (
        <div className="grid grid-cols-1 divide-y divide-slate-200/80 border-y border-slate-200/80 bg-[#FAF9F6] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-6 py-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
              Required funds
            </p>
            <p className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-slate-950">
              {metrics.requiredFormatted}
            </p>
            <p className="mt-0.5 text-[13px] text-slate-500">Unpaid tuition + 9 mo living</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
              Lowest ({metrics.eventDateFormatted})
            </p>
            <p className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-slate-950">
              {metrics.lowestFormatted}
            </p>
            <p className="mt-0.5 text-[13px] text-slate-500">Lowest 28-day closing balance</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
              {metrics.isShortfall ? 'Shortfall' : 'Buffer'}
            </p>
            <p
              className={`mt-1 font-display text-[24px] font-extrabold tracking-tight ${
                metrics.isShortfall ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {metrics.shortByFormatted}
            </p>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {metrics.isShortfall ? 'Below UK 28-day requirement' : 'Above UK 28-day requirement'}
            </p>
          </div>
        </div>
      )}

      {/* How to fix box */}
      {flag.suggestedFix && (
        <div className="border-b border-slate-200/80 bg-blue-50/70 px-6 py-4">
          <div className="flex items-start gap-2.5">
            <span
              className="material-symbols-outlined mt-0.5 !text-[20px] text-[#2563EB]"
              aria-hidden="true"
            >
              lightbulb
            </span>
            <p className="text-[15px] leading-relaxed text-slate-900">
              <strong className="font-semibold text-slate-950">Recommended next step: </strong>
              {formatInrInText(flag.suggestedFix)}
            </p>
          </div>
        </div>
      )}

      {/* See evidence (collapsed) */}
      {cleanQuote && (
        <details className="group bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-3.5 text-[14px] font-semibold text-[#2563EB] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">
            <span className="inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                description
              </span>
              <span>See verbatim evidence from your document</span>
            </span>
            <span
              className="material-symbols-outlined !text-[20px] transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              expand_more
            </span>
          </summary>
          <div className="border-t border-slate-200/80 bg-[#FAF9F6] px-6 py-4 text-[14px] text-slate-900">
            <p className="italic leading-relaxed text-slate-700">&ldquo;{cleanQuote}&rdquo;</p>
            {flag.sourceDocName && (
              <p className="mt-2 text-[13px] font-medium text-slate-500">
                Source document: {flag.sourceDocName}
              </p>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
