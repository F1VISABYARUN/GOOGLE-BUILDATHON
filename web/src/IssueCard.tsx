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
  dipDateFormatted: string;
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
  const dipDateFormatted = formatShortDate(dateMatch ? dateMatch[1] : '2026-11-04');

  return {
    requiredNum,
    lowestNum,
    shortByNum,
    requiredFormatted: formatRupees(requiredNum),
    lowestFormatted: formatRupees(lowestNum),
    shortByFormatted: formatRupees(shortByNum),
    dipDateFormatted,
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
  defaultEvidenceOpen?: boolean;
}

export default function IssueCard({ flag, defaultEvidenceOpen = false }: IssueCardProps) {
  const isFunds = flag.checkType === 'funds';
  const metrics = isFunds ? extractFundsMetrics(flag) : null;
  const isRed = flag.severity === 'red';

  const cleanTitle =
    isFunds && metrics?.isShortfall
      ? `Balance fell below the required amount on ${metrics.dipDateFormatted}`
      : formatInrInText(flag.title);

  const oneSentenceFix =
    isFunds && metrics?.isShortfall
      ? `Upload an updated Indian bank statement showing the closing balance stayed at or above ${metrics.requiredFormatted} for 28 straight days.`
      : formatInrInText(
          flag.suggestedFix || 'Update the document and run the check again before applying.'
        );

  const cleanQuote = dedupeQuote(flag.quote);

  // Build 28-day series for the SVG line chart (18 Oct 2026 -> 14 Nov 2026, dip at day index 17 = 4 Nov)
  const normalBalance = metrics ? Math.max(metrics.requiredNum + 104400, 3600000) : 3600000;
  const dipBalance = metrics ? metrics.lowestNum : 2850000;
  const reqBalance = metrics ? metrics.requiredNum : 3495600;

  const points: Array<{ dayIdx: number; label: string; value: number; isDip: boolean }> = [];
  const labels = [
    '18 Oct', '19 Oct', '20 Oct', '21 Oct', '22 Oct', '23 Oct', '24 Oct',
    '25 Oct', '26 Oct', '27 Oct', '28 Oct', '29 Oct', '30 Oct', '31 Oct',
    '1 Nov', '2 Nov', '3 Nov', '4 Nov', '5 Nov', '6 Nov', '7 Nov',
    '8 Nov', '9 Nov', '10 Nov', '11 Nov', '12 Nov', '13 Nov', '14 Nov',
  ];
  for (let i = 0; i < 28; i++) {
    const isDip = i === 17;
    points.push({
      dayIdx: i,
      label: labels[i],
      value: isDip ? dipBalance : normalBalance,
      isDip,
    });
  }

  // SVG coordinate math (viewBox 640 x 210)
  const minVal = Math.min(dipBalance, reqBalance) * 0.88;
  const maxVal = Math.max(normalBalance, reqBalance) * 1.04;
  const chartLeft = 16;
  const chartRight = 624;
  const chartTop = 28;
  const chartBottom = 172;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const toX = (idx: number) => chartLeft + (idx / 27) * chartW;
  const toY = (val: number) =>
    chartBottom - ((val - minVal) / Math.max(1, maxVal - minVal)) * chartH;

  const polylinePoints = points.map((p) => `${toX(p.dayIdx).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ');
  const reqY = toY(reqBalance);
  const dipX = toX(17);
  const dipY = toY(dipBalance);

  return (
    <article className="overflow-hidden rounded-[12px] border border-gray-200 bg-white">
      {/* Header */}
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-semibold ${
              isRed
                ? 'bg-[#FCE8E6] text-[#D93025]'
                : 'bg-[#FEF7E0] text-[#B06000]'
            }`}
          >
            <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
              {isRed ? 'error' : 'warning'}
            </span>
            <span>{isRed ? 'High risk' : 'Needs review'}</span>
          </span>
          {flag.sourceDocName && (
            <span className="text-[14px] text-gray-600">
              · {flag.sourceDocName}
            </span>
          )}
        </div>

        <h3 className="mt-3 text-[24px] font-bold leading-snug text-gray-900">
          {cleanTitle}
        </h3>
        <p className="mt-1.5 text-[16px] text-gray-600">
          {formatInrInText(flag.explanation || flag.summary)}
        </p>
      </div>

      {/* 3 Big Numbers in a Row */}
      {isFunds && metrics && (
        <div className="grid grid-cols-1 divide-y divide-gray-200 border-y border-gray-200 bg-gray-50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-6 py-4">
            <p className="text-[14px] font-medium text-gray-600">Required</p>
            <p className="mt-1 text-[24px] font-bold tracking-tight text-gray-900">
              {metrics.requiredFormatted}
            </p>
            <p className="mt-0.5 text-[14px] text-gray-600">Unpaid tuition + 9 mo living</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[14px] font-medium text-gray-600">
              Lowest ({metrics.dipDateFormatted})
            </p>
            <p className="mt-1 text-[24px] font-bold tracking-tight text-gray-900">
              {metrics.lowestFormatted}
            </p>
            <p className="mt-0.5 text-[14px] text-gray-600">Lowest closing balance in 28 days</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[14px] font-medium text-gray-600">
              {metrics.isShortfall ? 'Short by' : 'Buffer'}
            </p>
            <p
              className={`mt-1 text-[24px] font-bold tracking-tight ${
                metrics.isShortfall ? 'text-[#D93025]' : 'text-[#188038]'
              }`}
            >
              {metrics.shortByFormatted}
            </p>
            <p className="mt-0.5 text-[14px] text-gray-600">
              {metrics.isShortfall ? '1-day dip below UK threshold' : 'Above UK threshold'}
            </p>
          </div>
        </div>
      )}

      {/* Hero Visual: 28-Day Closing Balance Line Chart */}
      {isFunds && metrics && (
        <div className="border-b border-gray-200 px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-gray-900">
              28-day daily closing balance (18 Oct – 14 Nov 2026)
            </p>
            <div className="flex flex-wrap items-center gap-4 text-[14px] text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-[#1A73E8]" />
                Closing balance
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#D93025]">
                <span className="inline-block h-0.5 w-4 border-b-2 border-dashed border-[#D93025]" />
                Required ({metrics.requiredFormatted})
              </span>
            </div>
          </div>

          <svg
            viewBox="0 0 640 205"
            role="img"
            aria-label={`Line chart of 28-day closing balance showing a drop to ${metrics.lowestFormatted} on ${metrics.dipDateFormatted}, below the required ${metrics.requiredFormatted}`}
            className="h-auto w-full overflow-visible"
          >
            {/* Subtle background grid lines */}
            <line x1={chartLeft} y1={chartTop} x2={chartRight} y2={chartTop} stroke="#F3F4F6" strokeWidth="1" />
            <line x1={chartLeft} y1={chartBottom} x2={chartRight} y2={chartBottom} stroke="#E5E7EB" strokeWidth="1" />

            {/* Red shaded shortfall zone between threshold and bottom */}
            <rect
              x={chartLeft}
              y={reqY}
              width={chartW}
              height={Math.max(0, chartBottom - reqY)}
              fill="#FCE8E6"
              opacity="0.45"
            />

            {/* Dashed red threshold line */}
            <line
              x1={chartLeft}
              y1={reqY}
              x2={chartRight}
              y2={reqY}
              stroke="#D93025"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <text
              x={chartLeft + 6}
              y={reqY - 7}
              fill="#D93025"
              fontSize="12"
              fontWeight="600"
            >
              Required {metrics.requiredFormatted}
            </text>

            {/* Balance line */}
            <polyline
              fill="none"
              stroke="#1A73E8"
              strokeWidth="2.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylinePoints}
            />

            {/* Vertical drop connector from threshold to dip point */}
            {metrics.isShortfall && (
              <line
                x1={dipX}
                y1={reqY}
                x2={dipX}
                y2={dipY}
                stroke="#D93025"
                strokeWidth="1.75"
                strokeDasharray="3 3"
              />
            )}

            {/* Dip point marker */}
            <circle cx={dipX} cy={dipY} r="9" fill="#D93025" opacity="0.18" />
            <circle cx={dipX} cy={dipY} r="5.5" fill="#D93025" stroke="#FFFFFF" strokeWidth="2" />

            {/* Dip callout badge */}
            <g transform={`translate(${Math.min(dipX - 115, 385)}, ${Math.min(dipY + 14, 146)})`}>
              <rect
                x="0"
                y="0"
                width="238"
                height="24"
                rx="6"
                fill="#FCE8E6"
                stroke="#F6AEA9"
                strokeWidth="1"
              />
              <text x="119" y="16" textAnchor="middle" fill="#D93025" fontSize="12" fontWeight="700">
                {metrics.dipDateFormatted}: {metrics.lowestFormatted} (-{metrics.shortByFormatted})
              </text>
            </g>

            {/* X-axis date labels */}
            <text x={chartLeft} y="194" fill="#4B5563" fontSize="12">
              18 Oct 2026
            </text>
            <text x={dipX} y="194" textAnchor="middle" fill="#D93025" fontSize="12" fontWeight="700">
              4 Nov (Dip)
            </text>
            <text x={chartRight} y="194" textAnchor="end" fill="#4B5563" fontSize="12">
              14 Nov 2026
            </text>
          </svg>
        </div>
      )}

      {/* How to fix (blue tint, one plain sentence) */}
      <div className="flex items-start gap-3 border-b border-gray-200 bg-[#E8F0FE]/60 px-6 py-4">
        <span
          className="material-symbols-outlined mt-0.5 shrink-0 text-[#1A73E8]"
          aria-hidden="true"
        >
          info
        </span>
        <p className="text-[16px] text-gray-900">
          <strong className="font-semibold">How to fix:</strong> {oneSentenceFix}
        </p>
      </div>

      {/* See evidence (collapsed by default, shown once) */}
      <details open={defaultEvidenceOpen} className="group px-6 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-semibold text-[#1A73E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]">
          <span className="inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
              description
            </span>
            <span>See evidence from your document</span>
          </span>
          <span className="material-symbols-outlined !text-[18px] transition-transform group-open:rotate-180" aria-hidden="true">
            expand_more
          </span>
        </summary>
        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 text-[14px] text-gray-600">
          {cleanQuote && (
            <p className="font-mono text-[14px] text-gray-900">
              &ldquo;{cleanQuote}&rdquo;
            </p>
          )}
          {flag.mathLines && flag.mathLines.length > 0 && (
            <ul className="space-y-1 pt-1 text-[14px] text-gray-600">
              {flag.mathLines.map((line, idx) => (
                <li key={idx}>{formatInrInText(line)}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </article>
  );
}
