import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import TopNav from './TopNav.tsx';
import CounselorView from './CounselorView.tsx';
import PortalView from './PortalView.tsx';
import AgentRunnerPanel from './AgentRunnerPanel.tsx';
import { createSampleExceptionFiles, createSampleGreenFiles } from './samplePdfs.ts';

interface HelloResponse {
  model: string;
  text: string;
  latencyMs: number;
}

interface UkRules {
  country: string;
  asOf: string;
  sourceUrl: string;
  maintenance: {
    currency: string;
    londonPerMonth: number;
    outsideLondonPerMonth: number;
    maxMonths: number;
    note: string;
  };
  bankStatement: {
    minConsecutiveDaysHeld: number;
    maxAgeDays: number;
    sourceUrl: string;
    note: string;
  };
}

interface VerifiedFact {
  field: string;
  value: string;
  quote: string;
  page: number;
  confidence: number;
  sourceDocName: string;
  sourceDocType: string;
  quoteVerified: boolean;
  needsReview: boolean;
}

interface CheckFlag {
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

interface StatusStep {
  step: string;
  status: 'done' | 'current' | 'pending';
  at?: string;
}

interface CaseRecord {
  id: string;
  createdAt: string;
  status: string;
  queueBucket?: 'exceptions' | 'green_batch';
  exceptionReasons?: string[];
  riskScore?: {
    score: number;
    level: 'high' | 'medium' | 'low';
    brief: string;
    modelUsed: string;
  };
  destinationCountry: string;
  ukRegion?: 'london' | 'outside_london';
  storageBackend: 'firestore' | 'memory_fallback';
  documents: Array<{ fileName: string; mimeType: string; documentType: string }>;
  facts: VerifiedFact[];
  flags: CheckFlag[];
  statusTimeline: StatusStep[];
  usageSummary?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    agentSteps: number;
    estimatedUsd: number;
  };
}

function parseFundsTableRows(mathLines?: string[]): {
  required: string | null;
  lowest28Day: string | null;
  lowestLabel: string;
  gap: string | null;
  isShortfall: boolean;
} | null {
  if (!mathLines || mathLines.length === 0) return null;
  const reqLine = mathLines.find((l) => /^Total required funds:/i.test(l) || /^Required cost/i.test(l));
  const lowestLine =
    mathLines.find((l) => /lowest 28-day closing balance/i.test(l)) ||
    mathLines.find((l) => /^Total available funds/i.test(l));
  const gapLine = mathLines.find((l) => /^Shortfall:/i.test(l) || /^Buffer above required funds:/i.test(l));

  const extractInr = (line?: string): string | null => {
    if (!line) return null;
    const matches = line.match(/[+-]?INR\s*[0-9,]+/gi);
    if (matches && matches.length > 0) return matches[matches.length - 1].trim();
    const afterColon = line.split(':').slice(1).join(':').trim();
    return afterColon || null;
  };

  const required = extractInr(reqLine);
  const lowest28Day = extractInr(lowestLine);
  const gap = extractInr(gapLine);
  if (!required || !lowest28Day || !gap) return null;

  const dateMatch = lowestLine?.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const lowestLabel = dateMatch
    ? `Lowest balance in 28 days (${dateMatch[1]})`
    : 'Lowest balance in 28 days';

  return {
    required,
    lowest28Day,
    lowestLabel,
    gap,
    isShortfall: Boolean(gapLine && /^Shortfall:/i.test(gapLine)),
  };
}

function severityStyles(severity: 'red' | 'amber' | 'green') {
  if (severity === 'red') {
    return {
      card: 'border-red-200 bg-red-50/70',
      badge: 'bg-red-700 text-white',
      label: 'RED FLAG',
      Icon: XCircle,
      iconColor: 'text-red-700',
    };
  }
  if (severity === 'amber') {
    return {
      card: 'border-amber-200 bg-amber-50/70',
      badge: 'bg-amber-700 text-white',
      label: 'AMBER — REVIEW',
      Icon: AlertTriangle,
      iconColor: 'text-amber-700',
    };
  }
  return {
    card: 'border-emerald-200 bg-emerald-50/70',
    badge: 'bg-emerald-700 text-white',
    label: 'GREEN — PASSED',
    Icon: CheckCircle2,
    iconColor: 'text-emerald-700',
  };
}

export default function App() {
  function detectRoute(): 'student' | 'counselor' | 'portal' {
    if (window.location.pathname.startsWith('/counselor')) return 'counselor';
    if (window.location.pathname.startsWith('/portal')) return 'portal';
    return 'student';
  }

  const [route, setRoute] = useState<'student' | 'counselor' | 'portal'>(detectRoute);

  function navigateTo(next: 'student' | 'counselor' | 'portal') {
    const path = next === 'counselor' ? '/counselor' : next === 'portal' ? '/portal' : '/';
    window.history.pushState({}, '', path);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    function onPopState() {
      setRoute(detectRoute());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [step, setStep] = useState<'consent' | 'upload' | 'results'>('consent');
  const [deletingData, setDeletingData] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteConfirmationMsg, setDeleteConfirmationMsg] = useState<string | null>(null);

  // Consent & authorisation
  const [acceptedStorageNotice, setAcceptedStorageNotice] = useState(false);
  const [acceptedImmediateDeletion, setAcceptedImmediateDeletion] = useState(false);
  const [acceptedDeleteRight, setAcceptedDeleteRight] = useState(false);
  const [isUnder18, setIsUnder18] = useState(false);
  const [parentalConsentConfirmed, setParentalConsentConfirmed] = useState(false);
  const [authorisationAccepted, setAuthorisationAccepted] = useState(false);
  const [typedSignature, setTypedSignature] = useState('');
  const [signedAt, setSignedAt] = useState<string>('');
  const [consentError, setConsentError] = useState<string | null>(null);

  // Upload & rules state
  const [files, setFiles] = useState<File[]>([]);
  const [destinationCountry, setDestinationCountry] = useState<
    'UK' | 'US' | 'Canada' | 'Australia' | 'Germany' | 'Other'
  >('UK');
  const [ukRegion, setUkRegion] = useState<'london' | 'outside_london'>('london');
  const [requiredCostAmount, setRequiredCostAmount] = useState('');
  const [requiredCostCurrency, setRequiredCostCurrency] = useState('GBP');

  const [rateDate, setRateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rateGbp, setRateGbp] = useState('120');
  const [rateUsd, setRateUsd] = useState('96');
  const [rateEur, setRateEur] = useState('102');
  const [rateCad, setRateCad] = useState('68');
  const [rateAud, setRateAud] = useState('62');

  const [ukRules, setUkRules] = useState<UkRules | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [runningSample, setRunningSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [caseResult, setCaseResult] = useState<CaseRecord | null>(null);

  // Gemini system status drawer
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [helloReply, setHelloReply] = useState<HelloResponse | null>(null);
  const [helloLoading, setHelloLoading] = useState(false);
  const [helloError, setHelloError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ukRules) setUkRules(data.ukRules as UkRules);
        if (data?.exchangeRates) {
          if (data.exchangeRates.asOfDate) setRateDate(data.exchangeRates.asOfDate);
          const rates = data.exchangeRates.ratesToInr || {};
          if (rates.GBP) setRateGbp(String(rates.GBP));
          if (rates.USD) setRateUsd(String(rates.USD));
          if (rates.EUR) setRateEur(String(rates.EUR));
          if (rates.CAD) setRateCad(String(rates.CAD));
          if (rates.AUD) setRateAud(String(rates.AUD));
        }
      })
      .catch(() => {});

    fetch('/api/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models) setModels(data.models as string[]);
      })
      .catch(() => {});
  }, []);

  async function handleDeleteMyData() {
    if (!caseResult || deletingData) return;
    setDeletingData(true);
    setAnalyzeError(null);
    try {
      const res = await fetch(`/api/cases/${caseResult.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete your data.');
      setDeleteConfirmationMsg(
        data.message ||
          `Case ${caseResult.id} and all extracted facts, quotes, and tokens have been permanently deleted.`
      );
      setCaseResult(null);
      setFiles([]);
      setConfirmDeleteOpen(false);
      setStep('consent');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingData(false);
    }
  }

  if (route === 'counselor') {
    return <CounselorView onNavigate={navigateTo} />;
  }

  if (route === 'portal') {
    return <PortalView onNavigate={navigateTo} />;
  }

  function handleConsentSubmit(e: FormEvent) {
    e.preventDefault();
    setConsentError(null);

    if (!acceptedStorageNotice || !acceptedImmediateDeletion || !acceptedDeleteRight) {
      setConsentError('Please confirm all three privacy and data storage notices.');
      return;
    }
    if (isUnder18 && !parentalConsentConfirmed) {
      setConsentError('Parental or guardian consent is required for students under 18.');
      return;
    }
    if (!authorisationAccepted) {
      setConsentError('Please accept the one-time authorisation before continuing.');
      return;
    }
    if (typedSignature.trim().length < 2) {
      setConsentError('Please type your full legal name to sign.');
      return;
    }

    setSignedAt(new Date().toISOString());
    setStep('upload');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleFileChange(selected: FileList | null) {
    setAnalyzeError(null);
    if (!selected) return;
    const list = Array.from(selected);
    if (list.length > 5) {
      setAnalyzeError('You can upload up to 5 files at once.');
      return;
    }
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) {
        setAnalyzeError(`"${file.name}" is larger than 10 MB. Please upload a smaller file.`);
        return;
      }
    }
    setFiles(list);
  }

  async function handleAnalyzeSubmit(e: FormEvent) {
    e.preventDefault();
    setAnalyzeError(null);

    if (files.length === 0) {
      setAnalyzeError('Please choose at least one PDF, JPG, or PNG document.');
      return;
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append('documents', file);
    }

    formData.append(
      'consent',
      JSON.stringify({
        acceptedStorageNotice,
        acceptedImmediateDeletion,
        acceptedDeleteRight,
        isUnder18,
        parentalConsentConfirmed,
        authorisationAccepted,
        typedSignature: typedSignature.trim(),
        signedAt: signedAt || new Date().toISOString(),
      })
    );

    formData.append(
      'exchangeRates',
      JSON.stringify({
        asOfDate: rateDate,
        sourceNote: 'Student / counselor visible rate table',
        ratesToInr: {
          INR: 1,
          GBP: Number(rateGbp) || 120,
          USD: Number(rateUsd) || 96,
          EUR: Number(rateEur) || 102,
          CAD: Number(rateCad) || 68,
          AUD: Number(rateAud) || 62,
        },
      })
    );

    formData.append('destinationCountry', destinationCountry);
    if (destinationCountry === 'UK') {
      formData.append('ukRegion', ukRegion);
    }
    if (requiredCostAmount.trim() && Number(requiredCostAmount) > 0) {
      formData.append('requiredCostAmount', requiredCostAmount.trim());
      formData.append('requiredCostCurrency', requiredCostCurrency);
    }

    setAnalyzing(true);
    try {
      const res = await fetch('/api/cases/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Document check failed.');
      }
      setCaseResult(data as CaseRecord);
      setStep('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleRunSampleCase() {
    if (runningSample || analyzing) return;

    setConsentError(null);
    setAnalyzeError(null);
    setSampleError(null);
    setDeleteConfirmationMsg(null);

    const nowIso = new Date().toISOString();
    const sampleFiles = createSampleExceptionFiles();

    // Auto-fill DPDP consent & sample UK case parameters
    setAcceptedStorageNotice(true);
    setAcceptedImmediateDeletion(true);
    setAcceptedDeleteRight(true);
    setIsUnder18(false);
    setParentalConsentConfirmed(false);
    setAuthorisationAccepted(true);
    setTypedSignature('Sample Applicant');
    setSignedAt(nowIso);
    setDestinationCountry('UK');
    setUkRegion('london');
    setRequiredCostAmount('');
    setRequiredCostCurrency('GBP');
    setFiles(sampleFiles);

    const formData = new FormData();
    for (const file of sampleFiles) {
      formData.append('documents', file);
    }

    formData.append(
      'consent',
      JSON.stringify({
        acceptedStorageNotice: true,
        acceptedImmediateDeletion: true,
        acceptedDeleteRight: true,
        isUnder18: false,
        parentalConsentConfirmed: false,
        authorisationAccepted: true,
        typedSignature: 'Sample Applicant',
        signedAt: nowIso,
      })
    );

    formData.append(
      'exchangeRates',
      JSON.stringify({
        asOfDate: rateDate,
        sourceNote: 'Student / counselor visible rate table',
        ratesToInr: {
          INR: 1,
          GBP: Number(rateGbp) || 120,
          USD: Number(rateUsd) || 96,
          EUR: Number(rateEur) || 102,
          CAD: Number(rateCad) || 68,
          AUD: Number(rateAud) || 62,
        },
      })
    );

    formData.append('destinationCountry', 'UK');
    formData.append('ukRegion', 'london');

    setRunningSample(true);
    setAnalyzing(true);
    try {
      const res = await fetch('/api/cases/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Sample UK case failed.');
      }
      setCaseResult(data as CaseRecord);
      setStep('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setSampleError(msg);
      setAnalyzeError(msg);
    } finally {
      setRunningSample(false);
      setAnalyzing(false);
    }
  }

  async function handleSayHello() {
    setHelloLoading(true);
    setHelloError(null);
    try {
      const res = await fetch('/api/hello', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gemini request failed.');
      setHelloReply(data as HelloResponse);
    } catch (err) {
      setHelloError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setHelloLoading(false);
    }
  }

  const stepNum = step === 'consent' ? 1 : step === 'upload' ? 2 : 3;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#student-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <TopNav
        activeRoute="student"
        onNavigate={navigateTo}
        checkCompleted={step === 'results' && Boolean(caseResult)}
      />

      <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 sm:text-sm">
        Demo mode: sample data only — use sample documents or non-sensitive test files.
      </div>

      <main id="student-main" className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* HERO SPLIT BANNER */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md">
          <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              <h1 className="text-3xl font-extrabold tracking-tight text-indigo-950 sm:text-5xl sm:leading-[1.1]">
                Catch visa-refusal mistakes before you apply.
              </h1>
              <p className="text-base leading-relaxed text-slate-700 sm:text-lg">
                Aira reads your real documents, checks funds, names and dates in plain code, and a
                counselor approves before anything is submitted.
              </p>

              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-800 sm:text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-indigo-950">
                  <FileCheck2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  Quotes from your own documents
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-indigo-950">
                  <Calculator className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  Math done in code, not AI
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-indigo-950">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  Human approves every submit
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={runningSample || analyzing}
                  onClick={() => void handleRunSampleCase()}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-5 text-xl font-extrabold text-white shadow-xl shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
                >
                  {runningSample ? (
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-6 w-6" aria-hidden="true" />
                  )}
                  <span>
                    {runningSample ? 'Running sample UK case...' : 'Try with sample documents'}
                  </span>
                  {!runningSample && <ArrowRight className="h-6 w-6" aria-hidden="true" />}
                </button>
                <p className="text-xs font-medium text-slate-700 sm:text-sm">
                  One click · Zero typing · Runs a sample UK bank statement with a hidden 1-day balance dip
                </p>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                <img
                  src="/img/hero-student.webp"
                  alt="Illustration of an Indian student at a laptop reviewing checked bank statement, offer letter, and marksheet documents with a counselor giving a thumbs up"
                  loading="lazy"
                  width={1200}
                  height={900}
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* SUB-STEP PROGRESS FOR STEP 1 (CHECK) */}
          <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:px-8">
            <ol aria-label="Document check steps" className="grid gap-3 sm:grid-cols-3">
              {[
                { n: 1, title: 'Privacy & Authorisation', sub: 'DPDP consent + e-signature' },
                { n: 2, title: 'Upload Documents', sub: 'Files read in memory only' },
                { n: 3, title: 'Verdict, Quotes & Agent', sub: 'Fix mistakes before applying' },
              ].map((s) => {
                const isActive = stepNum === s.n;
                const isDone = stepNum > s.n;
                return (
                  <li
                    key={s.n}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                      isActive
                        ? 'border-blue-600 bg-white shadow-sm'
                        : isDone
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-slate-200 bg-white/60 text-slate-500'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isActive
                          ? 'bg-blue-700 text-white'
                          : isDone
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {isDone ? '✓' : s.n}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-950">{s.title}</p>
                      <p className="text-xs text-slate-600">{s.sub}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {runningSample && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3.5 rounded-2xl border-2 border-blue-300 bg-blue-50 p-5 text-blue-950 shadow-sm"
          >
            <Loader2 className="mt-0.5 h-6 w-6 shrink-0 animate-spin text-blue-700" aria-hidden="true" />
            <div>
              <p className="text-base font-extrabold text-blue-950">Running sample UK case...</p>
              <p className="mt-0.5 text-sm text-blue-900">
                Auto-filled DPDP consent for Sample Applicant, generated fake UK London CAS + Indian
                Bank Statement + Marksheet PDFs, and running Gemini fact extraction + plain-code UK
                funds &amp; ID-masking checks.
              </p>
            </div>
          </div>
        )}

        {sampleError && step !== 'upload' && (
          <div
            role="alert"
            className="rounded-2xl border border-red-300 bg-red-50 p-4 text-base text-red-900"
          >
            <p className="font-bold">Could not run sample UK case</p>
            <p className="mt-1">{sampleError}</p>
          </div>
        )}

        {deleteConfirmationMsg && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-base font-medium text-emerald-950 shadow-sm"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <div>
              <p className="font-bold">Data deleted</p>
              <p className="mt-0.5">{deleteConfirmationMsg}</p>
            </div>
          </div>
        )}

        {/* ONE-CLICK SAMPLE CTA RIGHT ABOVE STEP 1 CONSENT */}
        {step === 'consent' && (
          <section
            aria-label="Try with sample documents"
            className="rounded-3xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-900">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Instant Demo · Zero Typing
                </span>
                <h2 className="text-xl font-extrabold text-slate-950">
                  Skip manual entry — run the full UK sample case in one click
                </h2>
                <p className="text-sm text-slate-700">
                  Auto-fills DPDP consent, uploads fake UK London CAS + Bank Statement + Marksheet
                  PDFs, and lands directly on Flags, Verbatim Quotes, Masked IDs, and the Application
                  Agent.
                </p>
              </div>
              <button
                type="button"
                disabled={runningSample || analyzing}
                onClick={() => void handleRunSampleCase()}
                className="inline-flex w-full shrink-0 items-center justify-center gap-2.5 rounded-2xl bg-blue-700 px-7 py-4 text-lg font-extrabold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
              >
                {runningSample ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                )}
                <span>
                  {runningSample ? 'Running sample UK case...' : 'Try with sample documents'}
                </span>
                {!runningSample && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </section>
        )}

        {/* STEP 1: CONSENT & AUTHORISATION */}
        {step === 'consent' && (
          <form
            onSubmit={handleConsentSubmit}
            className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">
                Step 1: Privacy Consent &amp; One-Time Authorisation
              </h2>
              <p className="mt-1 text-base text-slate-600">
                Built to India’s DPDP Act standards. Review and sign before uploading any document.
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-blue-300 hover:bg-blue-50/30">
                <input
                  type="checkbox"
                  checked={acceptedStorageNotice}
                  onChange={(e) => setAcceptedStorageNotice(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span className="text-base text-slate-800">
                  <strong className="text-slate-950">What we store:</strong> Only extracted facts,
                  verbatim document quotes, check flags, and your consent record. Passport, bank
                  account, Aadhaar, and PAN numbers are masked to the last 4 digits.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-blue-300 hover:bg-blue-50/30">
                <input
                  type="checkbox"
                  checked={acceptedImmediateDeletion}
                  onChange={(e) => setAcceptedImmediateDeletion(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span className="text-base text-slate-800">
                  <strong className="text-slate-950">Immediate file deletion:</strong> Uploaded PDF
                  and image files stay in memory only and are deleted immediately after reading. We
                  never save document files to disk or cloud storage.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-blue-300 hover:bg-blue-50/30">
                <input
                  type="checkbox"
                  checked={acceptedDeleteRight}
                  onChange={(e) => setAcceptedDeleteRight(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span className="text-base text-slate-800">
                  <strong className="text-slate-950">Delete my data (DPDP Act):</strong> You can
                  permanently delete your entire case, extracted facts, quotes, and tokens at any
                  time with one click.
                </span>
              </label>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-base text-slate-800">
              <label className="flex cursor-pointer items-start gap-3.5">
                <input
                  type="checkbox"
                  checked={isUnder18}
                  onChange={(e) => setIsUnder18(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-900">I am under 18 years old.</span>
              </label>

              {isUnder18 && (
                <label className="ml-8 flex cursor-pointer items-start gap-3.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-slate-900">
                  <input
                    type="checkbox"
                    checked={parentalConsentConfirmed}
                    onChange={(e) => setParentalConsentConfirmed(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                  />
                  <span>
                    <strong>Parental / guardian consent:</strong> My parent or legal guardian has
                    reviewed this notice and consents to Aira processing my application facts.
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/80 p-5 text-base text-slate-900">
              <p className="flex items-center gap-2 font-bold text-blue-950">
                <ShieldCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
                One-Time Student Authorisation
              </p>
              <p className="leading-relaxed text-slate-800">
                I authorise Aira Application Agent to extract facts from my documents, create
                application accounts on direct university portals (never Common App or UCAS), and
                prepare my applications using only my own verified facts. No application will be
                submitted until a human counselor approves it, and I will sign any visa forms (such
                as the US DS-160) myself.
              </p>
              <label className="flex cursor-pointer items-start gap-3.5 pt-1">
                <input
                  type="checkbox"
                  checked={authorisationAccepted}
                  onChange={(e) => setAuthorisationAccepted(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span className="font-semibold text-blue-950">
                  I agree to this one-time authorisation.
                </span>
              </label>
            </div>

            <div>
              <label htmlFor="typed-signature" className="block text-base font-bold text-slate-950">
                Type your full legal name as your e-signature
              </label>
              <input
                id="typed-signature"
                type="text"
                value={typedSignature}
                onChange={(e) => setTypedSignature(e.target.value)}
                placeholder="e.g. Arun Reddy"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-lg text-slate-950 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>

            {consentError && (
              <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-base font-medium text-red-900">
                {consentError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-7 py-4 text-lg font-bold text-white shadow-md transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 sm:w-auto"
              >
                <span>Sign &amp; Continue to Upload</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => navigateTo('counselor')}
                className="text-sm font-semibold text-slate-700 underline underline-offset-4 hover:text-slate-950"
              >
                Are you a counselor? Open Exception Queue →
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: UPLOAD & CHECK SETTINGS */}
        {step === 'upload' && (
          <form
            onSubmit={handleAnalyzeSubmit}
            className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-950">
                  Step 2: Upload Documents
                </h2>
                <p className="mt-1 text-base text-slate-600">
                  Upload up to 5 PDF, JPG, or PNG files (max 10 MB each).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep('consent')}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                Edit consent
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
              <span>
                Signed by <strong>{typedSignature}</strong> at{' '}
                {new Date(signedAt).toLocaleString()}. Uploaded files stay in memory only and are
                deleted right after reading.
              </span>
            </div>

            {/* ONE-CLICK SAMPLE DOCUMENTS FOR JUDGES */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-blue-950">
                    No files handy? Load fake sample UK documents in one click
                  </p>
                  <p className="text-xs text-blue-900">
                    Generates sample PDFs directly in your browser (CAS + Bank Statement + Marksheet) with zero personal data.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyzeError(null);
                      setDestinationCountry('UK');
                      setUkRegion('london');
                      setFiles(createSampleExceptionFiles());
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800 sm:text-sm"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>Load Sample (28-Day Dip + Masked IDs)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyzeError(null);
                      setDestinationCountry('UK');
                      setUkRegion('outside_london');
                      setFiles(createSampleGreenFiles());
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-100 sm:text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    <span>Load Clean Green Sample</span>
                  </button>
                </div>
              </div>
            </div>

            {/* DRAG-AND-DROP STYLE UPLOAD BOX */}
            <div>
              <label
                htmlFor="doc-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 px-6 py-8 text-center transition hover:border-blue-500 hover:bg-blue-50/80"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <UploadCloud className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="mt-3 text-lg font-bold text-slate-950">
                  Click to choose marksheets, passport, bank/loan letter, or CAS/offer
                </span>
                <span className="mt-1 text-sm text-slate-600">
                  PDF, JPG, or PNG · Up to 5 files · 10 MB max per file · Never saved to Cloud Storage
                </span>
                <input
                  id="doc-upload"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(e) => handleFileChange(e.target.files)}
                  className="sr-only"
                />
              </label>

              {files.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {files.map((f) => (
                    <li
                      key={f.name}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"
                    >
                      <FileText className="h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
                      <span className="truncate">{f.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-slate-600">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="country" className="block text-sm font-bold text-slate-900">
                  Destination country
                </label>
                <select
                  id="country"
                  value={destinationCountry}
                  onChange={(e) =>
                    setDestinationCountry(e.target.value as typeof destinationCountry)
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  <option value="UK">United Kingdom (UK)</option>
                  <option value="US">United States (US)</option>
                  <option value="Canada">Canada</option>
                  <option value="Australia">Australia</option>
                  <option value="Germany">Germany</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {destinationCountry === 'UK' && (
                <div>
                  <label htmlFor="uk-region" className="block text-sm font-bold text-slate-900">
                    UK study location
                  </label>
                  <select
                    id="uk-region"
                    value={ukRegion}
                    onChange={(e) => setUkRegion(e.target.value as 'london' | 'outside_london')}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
                  >
                    <option value="london">London (GBP 1,570 / month × 9)</option>
                    <option value="outside_london">Outside London (GBP 1,203 / month × 9)</option>
                  </select>
                </div>
              )}
            </div>

            {destinationCountry === 'UK' && ukRules && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <strong>UK rules</strong> (effective {ukRules.asOf}): Required funds = Unpaid CAS
                tuition (tuition minus deposit paid) + 9 months living costs ·{' '}
                <a
                  href={ukRules.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-blue-700 underline"
                >
                  gov.uk/student-visa/money
                </a>{' '}
                · {ukRules.bankStatement.minConsecutiveDaysHeld}-day holding &amp;{' '}
                {ukRules.bankStatement.maxAgeDays}-day freshness window.
              </div>
            )}

            <fieldset className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <legend className="px-2 text-sm font-bold text-slate-900">
                Optional: Required university cost (if not on an uploaded CAS / offer letter)
              </legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="req-cost" className="block text-xs font-semibold text-slate-700">
                    Total required amount
                  </label>
                  <input
                    id="req-cost"
                    type="number"
                    min="0"
                    value={requiredCostAmount}
                    onChange={(e) => setRequiredCostAmount(e.target.value)}
                    placeholder="Leave blank to use CAS / UK rule"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="req-curr" className="block text-xs font-semibold text-slate-700">
                    Currency
                  </label>
                  <select
                    id="req-curr"
                    value={requiredCostCurrency}
                    onChange={(e) => setRequiredCostCurrency(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base"
                  >
                    <option value="GBP">GBP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <legend className="px-2 text-sm font-bold text-slate-900">
                Visible, Dated Exchange Rates (INR per 1 unit — editable)
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="rate-date" className="block text-xs font-semibold text-slate-700">
                    As-of date
                  </label>
                  <input
                    id="rate-date"
                    type="date"
                    value={rateDate}
                    onChange={(e) => setRateDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                {[
                  { id: 'rate-gbp', label: '1 GBP in INR', val: rateGbp, set: setRateGbp },
                  { id: 'rate-usd', label: '1 USD in INR', val: rateUsd, set: setRateUsd },
                  { id: 'rate-eur', label: '1 EUR in INR', val: rateEur, set: setRateEur },
                  { id: 'rate-cad', label: '1 CAD in INR', val: rateCad, set: setRateCad },
                  { id: 'rate-aud', label: '1 AUD in INR', val: rateAud, set: setRateAud },
                ].map((r) => (
                  <div key={r.id}>
                    <label htmlFor={r.id} className="block text-xs font-semibold text-slate-700">
                      {r.label}
                    </label>
                    <input
                      id={r.id}
                      type="number"
                      step="0.01"
                      value={r.val}
                      onChange={(e) => r.set(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            {analyzeError && (
              <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-base text-red-900">
                <p className="font-bold">Could not check documents</p>
                <p className="mt-1">{analyzeError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={analyzing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-7 py-4 text-lg font-bold text-white shadow-md transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
            >
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
              <span>
                {analyzing ? 'Reading documents & running checks...' : 'Extract Facts & Run Checks'}
              </span>
            </button>
          </form>
        )}

        {/* STEP 3: STUDENT RESULTS PAGE */}
        {step === 'results' && caseResult && (() => {
          const redCount = caseResult.flags.filter((f) => f.severity === 'red').length;
          const amberCount = caseResult.flags.filter((f) => f.severity === 'amber').length;
          const issueCount = redCount + amberCount;
          const isHighRisk = redCount > 0;
          const isReady = issueCount === 0;
          const maskedFactsCount = caseResult.facts.filter((f) =>
            ['passport_number', 'account_number', 'aadhaar_number', 'pan_number'].includes(f.field)
          ).length;

          return (
            <div className="space-y-6">
              {/* VERDICT CARD AT TOP */}
              <section
                aria-label="Document check verdict"
                className={`rounded-3xl border-2 p-6 shadow-md sm:p-8 ${
                  isHighRisk
                    ? 'border-red-300 bg-red-50/90'
                    : isReady
                      ? 'border-emerald-300 bg-emerald-50/90'
                      : 'border-amber-300 bg-amber-50/90'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <span
                      className={`mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                        isHighRisk
                          ? 'bg-red-700 text-white'
                          : isReady
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-600 text-white'
                      }`}
                    >
                      {isHighRisk ? (
                        <XCircle className="h-7 w-7" aria-hidden="true" />
                      ) : isReady ? (
                        <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-extrabold uppercase tracking-wide ${
                          isHighRisk
                            ? 'bg-red-700 text-white'
                            : isReady
                              ? 'bg-emerald-700 text-white'
                              : 'bg-amber-700 text-white'
                        }`}
                      >
                        {isHighRisk ? 'High refusal risk' : isReady ? 'Ready for counselor' : 'Needs review'}
                      </span>
                      <h2 className="mt-1.5 text-2xl font-extrabold text-slate-950 sm:text-3xl">
                        {isHighRisk
                          ? `High refusal risk: ${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`
                          : isReady
                            ? 'Ready for counselor'
                            : `Review needed: ${issueCount} ${issueCount === 1 ? 'item' : 'items'}`}
                      </h2>
                      <p className="mt-1 text-sm font-medium text-slate-700">
                        Case <span className="font-mono font-bold text-slate-950">{caseResult.id}</span>
                        {maskedFactsCount > 0 && (
                          <> · {maskedFactsCount} sensitive ID(s) masked (Passport / PAN / Aadhaar)</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => navigateTo('counselor')}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      <span>Continue to Counselor Approval →</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFiles([]);
                        setCaseResult(null);
                        setStep('upload');
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                    >
                      Check another set
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-900 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span>Delete My Data</span>
                    </button>
                  </div>
                </div>

                {confirmDeleteOpen && (
                  <div
                    role="alertdialog"
                    aria-label="Confirm data deletion"
                    className="mt-4 rounded-2xl border-2 border-red-400 bg-white p-5 text-base text-red-950"
                  >
                    <p className="font-bold">Permanently delete this case and all extracted facts?</p>
                    <p className="mt-1 text-sm text-slate-700">
                      This removes {caseResult.id}, all facts, quotes, flags, consent records, and
                      tokens from Google Firestore immediately.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={deletingData}
                        onClick={() => void handleDeleteMyData()}
                        className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-50"
                      >
                        {deletingData ? 'Deleting...' : 'Yes, Permanently Delete My Data'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteOpen(false)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* FLAGS AS CLEAN CARDS: WHAT'S WRONG -> HIGHLIGHTED QUOTE -> HOW TO FIX */}
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-extrabold text-slate-950">Checks &amp; Flags</h2>
                <p className="mt-1 text-base text-slate-700">
                  Every check ran in plain code against verbatim quotes from your uploaded files.
                </p>

                <div className="mt-5 space-y-4">
                  {caseResult.flags.map((flag) => {
                    const style = severityStyles(flag.severity);
                    const FlagIcon = style.Icon;
                    const fundsTable =
                      flag.checkType === 'funds' ? parseFundsTableRows(flag.mathLines) : null;

                    return (
                      <article key={flag.id} className={`rounded-2xl border p-5 ${style.card}`}>
                        {/* 1. What's wrong */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <FlagIcon className={`h-5 w-5 shrink-0 ${style.iconColor}`} aria-hidden="true" />
                          <span className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${style.badge}`}>
                            {style.label}
                          </span>
                          <h3 className="text-lg font-extrabold text-slate-950">{flag.title}</h3>
                        </div>

                        <p className="mt-2 text-base leading-relaxed text-slate-800">
                          {flag.explanation || flag.summary}
                        </p>

                        {/* Simple 3-row Funds Math Table */}
                        {fundsTable && (
                          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-700">
                                <tr>
                                  <th className="px-4 py-2.5">UK Funds Check (Plain Code)</th>
                                  <th className="px-4 py-2.5 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-900">
                                <tr>
                                  <td className="px-4 py-2.5 font-medium">Required (unpaid tuition + 9 mo living)</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{fundsTable.required}</td>
                                </tr>
                                <tr>
                                  <td className="px-4 py-2.5 font-medium">{fundsTable.lowestLabel}</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{fundsTable.lowest28Day}</td>
                                </tr>
                                <tr className={fundsTable.isShortfall ? 'bg-red-50/70' : 'bg-emerald-50/70'}>
                                  <td className="px-4 py-3 font-extrabold text-slate-950">Gap</td>
                                  <td
                                    className={`px-4 py-3 text-right font-mono text-base font-extrabold ${
                                      fundsTable.isShortfall ? 'text-red-700' : 'text-emerald-700'
                                    }`}
                                  >
                                    {fundsTable.gap}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            {flag.mathLines && flag.mathLines.length > 0 && (
                              <details className="border-t border-slate-200 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-700">
                                <summary className="cursor-pointer font-semibold text-indigo-900 hover:underline">
                                  Show full plain-code calculation breakdown
                                </summary>
                                <ul className="mt-2 space-y-1 font-mono text-xs text-slate-800">
                                  {flag.mathLines.map((line, idx) => (
                                    <li key={idx}>{line}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        )}

                        {!fundsTable && flag.mathLines && flag.mathLines.length > 0 && (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                              Funds Math (Plain Code)
                            </p>
                            <ul className="mt-2 space-y-1 font-mono text-sm text-slate-900">
                              {flag.mathLines.map((line, idx) => (
                                <li key={idx}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 2. Exact quote from the document, highlighted */}
                        {flag.quote && (
                          <blockquote className="mt-3 rounded-xl border-l-4 border-amber-500 bg-amber-100/70 px-4 py-2.5 font-mono text-xs font-medium text-slate-950 sm:text-sm">
                            <span className="font-sans text-xs font-bold uppercase tracking-wide text-amber-950">
                              Quote from document:{' '}
                            </span>
                            {flag.quote}
                          </blockquote>
                        )}

                        {/* 3. How to fix */}
                        {flag.suggestedFix && (
                          <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900">
                            <strong className="text-indigo-950">How to fix:</strong> {flag.suggestedFix}
                          </p>
                        )}

                        {flag.sourceUrl && (
                          <p className="mt-2 text-xs text-slate-700">
                            Official rule source (as of {flag.ruleAsOf}):{' '}
                            <a
                              href={flag.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            >
                              {flag.sourceUrl}
                            </a>
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* STEP 3 LAUNCHER: APPLICATION AGENT & UNIVERSITY RULES */}
              <section
                id="start-application-agent"
                aria-labelledby="start-application-agent-heading"
                className="space-y-4 rounded-3xl border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-slate-50 p-4 shadow-sm sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-1">
                  <div>
                    <h2
                      id="start-application-agent-heading"
                      className="text-2xl font-extrabold text-indigo-950"
                    >
                      Next: Approve &amp; Fill University Portal
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-700">
                      Let Gemini fill the portal draft (it stops before Submit), or jump straight to
                      Step 2 to approve as counselor.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateTo('counselor')}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    <span>Go to Step 2: Counselor Approves →</span>
                  </button>
                </div>

                <AgentRunnerPanel
                  caseId={caseResult.id}
                  onOpenCounselor={() => navigateTo('counselor')}
                  onOpenPortal={() => navigateTo('portal')}
                />
              </section>

              {/* COLLAPSED "UNDER THE HOOD" SECTION: GOOGLE AI MODELS, FACTS, TOKENS & COST */}
              <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-950">
                      Under the hood: Gemini models, extracted facts &amp; audit details
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-700">
                      {caseResult.facts.length} verified facts · {caseResult.documents.length} documents read
                      {caseResult.usageSummary
                        ? ` · Est. AI cost $${caseResult.usageSummary.estimatedUsd.toFixed(4)}`
                        : ''}
                    </p>
                  </div>
                  <span className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800">
                    Expand
                  </span>
                </summary>

                <div className="mt-6 space-y-6 border-t border-slate-200 pt-6">
                  {/* GOOGLE AI MODEL STRIP (Real model names from server/src/config/models.ts) */}
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wide text-indigo-900">
                      Google Gemini Models Used
                    </h3>
                    <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {[
                        { model: 'gemini-4-hydrogen', job: 'Reads documents & extracts verbatim quotes' },
                        { model: 'gemini-4-neon', job: 'Looks up university rules (Search + URL Context)' },
                        { model: 'gemini-4-hydrogen', job: 'Fills the portal (computer use, escalates to gemini-4-carbon)' },
                        { model: 'gemini-4-carbon', job: 'Writes plain-English fixes & scores refusal risk' },
                        { model: 'gemini-3.8-flash', job: 'Classifies document types & reads verification codes' },
                      ].map((item, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-2.5 text-sm"
                        >
                          <span className="font-semibold text-slate-900">{item.job}</span>
                          <code className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-bold text-indigo-900 ring-1 ring-indigo-200">
                            {item.model}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* TOKEN COUNTS & CASE COST */}
                  {caseResult.usageSummary && (
                    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-4">
                      <div>
                        <p className="font-semibold text-slate-700">Input Tokens</p>
                        <p className="font-mono text-base font-bold text-slate-950">
                          {caseResult.usageSummary.totalInputTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">Output Tokens</p>
                        <p className="font-mono text-base font-bold text-slate-950">
                          {caseResult.usageSummary.totalOutputTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">Est. AI Cost (USD)</p>
                        <p className="font-mono text-base font-bold text-emerald-700">
                          ${caseResult.usageSummary.estimatedUsd.toFixed(4)}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">Storage</p>
                        <p className="text-base font-bold text-slate-950">
                          {caseResult.storageBackend === 'firestore' ? 'Google Firestore' : 'Local memory'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* EXTRACTED FACTS WITH QUOTES */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950">
                      Extracted Facts &amp; Verbatim Quotes
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">
                      Documents read:{' '}
                      {caseResult.documents.map((d) => `${d.fileName} (${d.documentType})`).join(', ')}.{' '}
                      Passport, PAN, Aadhaar, and bank account numbers are masked to the last 4 digits.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {caseResult.facts.map((fact, index) => (
                        <div
                          key={`${fact.field}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold uppercase tracking-wide text-slate-700">
                              {fact.field.replace(/_/g, ' ')}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                fact.needsReview
                                  ? 'bg-amber-200 text-amber-950'
                                  : 'bg-emerald-200 text-emerald-950'
                              }`}
                            >
                              {fact.needsReview ? (
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              )}
                              {fact.needsReview ? 'Needs review' : 'Quote verified'}
                            </span>
                          </div>
                          <p className="mt-1 text-base font-bold text-slate-950">{fact.value}</p>
                          <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                            &ldquo;{fact.quote}&rdquo;
                          </p>
                          <p className="mt-1.5 text-xs text-slate-700">
                            {fact.sourceDocName} · page {fact.page}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* STATUS TIMELINE */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950">Status Timeline</h3>
                    <ol className="mt-3 space-y-2.5">
                      {caseResult.statusTimeline.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-sm">
                          <span
                            className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              item.status === 'done'
                                ? 'bg-emerald-600 text-white'
                                : item.status === 'current'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            {item.status === 'done' ? '✓' : idx + 1}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-950">{item.step}</p>
                            {item.at && (
                              <p className="text-xs text-slate-700">
                                {new Date(item.at).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </details>
            </div>
          );
        })()}

        {/* COLLAPSIBLE GEMINI API & MODELS STATUS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setShowSystemCheck((v) => !v)}
            className="flex w-full items-center justify-between text-left text-base font-bold text-slate-900"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
              Live Gemini API Status &amp; Models ({models.length})
            </span>
            {showSystemCheck ? (
              <ChevronUp className="h-5 w-5 text-slate-600" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-600" aria-hidden="true" />
            )}
          </button>

          {showSystemCheck && (
            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={handleSayHello}
                disabled={helloLoading}
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {helloLoading ? 'Asking Gemini...' : 'Test Live /api/hello'}
              </button>

              {helloError && (
                <p role="alert" className="text-sm font-medium text-red-800">
                  {helloError}
                </p>
              )}

              {helloReply && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <p className="font-semibold">{helloReply.text}</p>
                  <p className="mt-1 font-mono text-xs">
                    Model: {helloReply.model} · {helloReply.latencyMs} ms
                  </p>
                </div>
              )}

              {models.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-3">
                  {models.map((m) => (
                    <li
                      key={m}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-medium text-slate-900"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
