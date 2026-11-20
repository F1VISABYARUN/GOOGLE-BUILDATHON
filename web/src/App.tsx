import { useEffect, useState, type FormEvent } from 'react';
import TopNav from './TopNav.tsx';
import CounselorView from './CounselorView.tsx';
import PortalView from './PortalView.tsx';
import AgentRunnerPanel, { UniversityRulesLookup } from './AgentRunnerPanel.tsx';
import IssueCard, { type IssueFlagData } from './IssueCard.tsx';
import { createSampleExceptionFiles, createSampleGreenFiles } from './samplePdfs.ts';
import { formatInrInText, formatShortDate } from './formatInr.ts';

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
  consent?: { typedSignature?: string; signedAt?: string };
  documents: Array<{ fileName: string; mimeType: string; documentType: string }>;
  facts: VerifiedFact[];
  flags: IssueFlagData[];
  statusTimeline: StatusStep[];
  usageSummary?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    agentSteps: number;
    estimatedUsd: number;
  };
}

const SAMPLE_HERO_PREVIEW_FLAG: IssueFlagData = {
  id: 'preview-uk-28-day-dip',
  checkType: 'funds',
  severity: 'red',
  title: 'Balance fell below the required amount on 4 Nov 2026',
  summary:
    'Closing balance dropped to ₹28,50,000 on 4 Nov 2026, which is ₹6,45,600 short of the required ₹34,95,600.',
  explanation:
    'Even though the final balance recovered to ₹36,00,000, one day below the threshold breaks the UK 28-day continuous funding rule.',
  quote:
    'SAMPLE_INDIAN_BANK_STATEMENT.pdf: "2026-11-04 Daily Closing Balance: INR 2850000" · SAMPLE_UK_CAS_OFFER.pdf: "Total First Year Tuition Fee: GBP 20000 | Tuition Deposit Paid: GBP 5000"',
  sourceDocName: 'Indian Bank Statement (for UK visa)',
  mathLines: [
    'Total required funds: INR 34,95,600',
    'Lowest 28-day closing balance (2026-11-04): INR 28,50,000',
    'Shortfall: INR 6,45,600',
  ],
  suggestedFix:
    'Upload an updated Indian bank statement showing the closing balance stayed at or above ₹34,95,600 for 28 straight days.',
};

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
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  useEffect(() => {
    function onPopState() {
      setRoute(detectRoute());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [step, setStep] = useState<'home' | 'upload' | 'results'>('home');
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [isSampleRun, setIsSampleRun] = useState(false);

  const [deletingData, setDeletingData] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteConfirmationMsg, setDeleteConfirmationMsg] = useState<string | null>(null);

  // Consent & permission state (inside modal)
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
  }, []);

  useEffect(() => {
    if (step === 'results' && caseResult) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [step, caseResult?.id]);

  async function handleDeleteMyData() {
    if (!caseResult || deletingData) return;
    setDeletingData(true);
    setAnalyzeError(null);
    try {
      const res = await fetch(`/api/cases/${caseResult.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete your data.');
      setDeleteConfirmationMsg(
        data.message || 'Your check and all saved details have been permanently deleted.'
      );
      setCaseResult(null);
      setFiles([]);
      setConfirmDeleteOpen(false);
      setIsSampleRun(false);
      setStep('home');
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
      setConsentError('Please tick all three privacy boxes to continue.');
      return;
    }
    if (isUnder18 && !parentalConsentConfirmed) {
      setConsentError('Parent or guardian permission is required if you are under 18.');
      return;
    }
    if (!authorisationAccepted) {
      setConsentError('Please agree to the one-time permission before continuing.');
      return;
    }
    if (typedSignature.trim().length < 2) {
      setConsentError('Please type your full name to sign.');
      return;
    }

    setSignedAt(new Date().toISOString());
    setConsentModalOpen(false);
    setIsSampleRun(false);
    setStep('upload');
    window.scrollTo({ top: 0, behavior: 'auto' });
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
        setAnalyzeError(`"${file.name}" is over 10 MB. Please choose a smaller file.`);
        return;
      }
    }
    setFiles(list);
  }

  async function handleAnalyzeSubmit(e: FormEvent) {
    e.preventDefault();
    setAnalyzeError(null);

    if (files.length === 0) {
      setAnalyzeError('Please choose at least one PDF, JPG, or PNG file.');
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
        sourceNote: 'Visible exchange rate table',
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
      window.scrollTo({ top: 0, behavior: 'auto' });
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
    setIsSampleRun(true);

    const nowIso = new Date().toISOString();
    const sampleFiles = createSampleExceptionFiles();

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
        sourceNote: 'Visible exchange rate table',
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
        throw new Error(data.details || data.error || 'Sample check failed.');
      }
      setCaseResult(data as CaseRecord);
      setStep('results');
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setSampleError(msg);
      setAnalyzeError(msg);
    } finally {
      setRunningSample(false);
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <a
        href="#student-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-[#1A73E8] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <TopNav
        activeRoute="student"
        onNavigate={navigateTo}
        checkCompleted={step === 'results' && Boolean(caseResult)}
        showDemoPill={isSampleRun}
      />

      <main
        id="student-main"
        className="mx-auto w-full max-w-[1120px] flex-1 space-y-8 px-4 py-8 sm:px-6"
      >
        {/* =====================================================================
            SCREEN 1: HOME
           ===================================================================== */}
        {step === 'home' && (
          <div className="space-y-8">
            {/* Hero 2-column grid */}
            <section className="grid items-start gap-8 lg:grid-cols-12">
              {/* Left half: H1 + Sub + 2 Buttons */}
              <div className="space-y-6 lg:col-span-5 lg:pt-4">
                <h1 className="text-[32px] font-bold leading-[1.18] tracking-tight text-gray-900">
                  Catch the visa refusal before the officer does.
                </h1>
                <p className="text-[16px] leading-relaxed text-gray-600">
                  Aira checks bank statements, offer letters and passports against official UK
                  rules, then fills the university application only after a counselor approves.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {/* Sole Primary Button on Screen 1 */}
                  <button
                    type="button"
                    disabled={runningSample || analyzing}
                    onClick={() => void handleRunSampleCase()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white transition hover:bg-[#1557B0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                      play_arrow
                    </span>
                    <span>
                      {runningSample ? 'Running sample check...' : 'Run sample check (30 sec)'}
                    </span>
                    <span className="sr-only">Try with sample documents</span>
                  </button>

                  {/* Secondary Outline Button -> opens Consent Modal */}
                  <button
                    type="button"
                    disabled={runningSample || analyzing}
                    onClick={() => {
                      setConsentError(null);
                      setConsentModalOpen(true);
                    }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-gray-300 bg-white px-5 text-[16px] font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                  >
                    <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                      upload_file
                    </span>
                    <span>Upload your documents</span>
                  </button>
                </div>

                {/* Trust strip: one line with icons */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 pt-4 text-[14px] text-gray-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[18px] text-[#188038]" aria-hidden="true">
                      memory
                    </span>
                    Files read in memory
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[18px] text-[#188038]" aria-hidden="true">
                      visibility_off
                    </span>
                    IDs masked
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[18px] text-[#188038]" aria-hidden="true">
                      verified_user
                    </span>
                    Nothing submitted without a counselor
                  </span>
                </div>
              </div>

              {/* Right half: Real preview of the new Verdict + 28-Day Line Chart Card */}
              <div className="lg:col-span-7" aria-label="Sample check preview">
                <div className="mb-2 flex items-center justify-between text-[14px] text-gray-600">
                  <span className="font-medium text-gray-900">
                    Sample check result · Indian bank statement (for UK visa)
                  </span>
                  <span>28-day balance check</span>
                </div>
                <IssueCard flag={SAMPLE_HERO_PREVIEW_FLAG} />
              </div>
            </section>

            {runningSample && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 rounded-[12px] border border-gray-200 bg-gray-50 px-5 py-4 text-[16px] text-gray-900"
              >
                <span className="material-symbols-outlined animate-spin text-[#1A73E8]" aria-hidden="true">
                  progress_activity
                </span>
                <span>
                  Checking sample UK offer letter, Indian bank statement (for UK visa), and
                  marksheet...
                </span>
              </div>
            )}

            {sampleError && (
              <div
                role="alert"
                className="rounded-[12px] border border-[#F6AEA9] bg-[#FCE8E6] p-4 text-[16px] text-[#D93025]"
              >
                {sampleError}
              </div>
            )}

            {deleteConfirmationMsg && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-[12px] border border-[#CEEAD6] bg-[#E6F4EA] p-4 text-[16px] text-[#188038]"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  check_circle
                </span>
                <span>{deleteConfirmationMsg}</span>
              </div>
            )}

            {/* Row of 3 tiles: "What Aira catches" */}
            <section className="space-y-3">
              <h2 className="text-[18px] font-bold text-gray-900">What Aira catches</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[12px] border border-gray-200 bg-gray-50 p-5">
                  <span className="material-symbols-outlined text-[#D93025]" aria-hidden="true">
                    trending_down
                  </span>
                  <h3 className="mt-2 text-[16px] font-bold text-gray-900">
                    One-day balance dip in the 28-day window
                  </h3>
                  <p className="mt-1 text-[14px] text-gray-600">
                    Checks every daily closing balance so a single low day never surprises you at
                    the visa stage.
                  </p>
                </div>

                <div className="rounded-[12px] border border-gray-200 bg-gray-50 p-5">
                  <span className="material-symbols-outlined text-[#F9AB00]" aria-hidden="true">
                    badge
                  </span>
                  <h3 className="mt-2 text-[16px] font-bold text-gray-900">
                    Name mismatch across documents
                  </h3>
                  <p className="mt-1 text-[14px] text-gray-600">
                    Compares your passport, marksheet, bank statement, and offer letter letter by
                    letter.
                  </p>
                </div>

                <div className="rounded-[12px] border border-gray-200 bg-gray-50 p-5">
                  <span className="material-symbols-outlined text-[#1A73E8]" aria-hidden="true">
                    calculate
                  </span>
                  <h3 className="mt-2 text-[16px] font-bold text-gray-900">
                    Unpaid tuition not covered
                  </h3>
                  <p className="mt-1 text-[14px] text-gray-600">
                    Adds your remaining tuition and 9 months of UK living costs against your real
                    funds.
                  </p>
                </div>
              </div>
            </section>

            {/* LIVE RECORDED VIDEO PROOF: Real University of Glasgow */}
            <section className="overflow-hidden rounded-[12px] border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[20px] text-[#1A73E8]" aria-hidden="true">
                      play_circle
                    </span>
                    <h2 className="text-[18px] font-bold text-gray-900">
                      Watch Aira fill a real UK university portal (University of Glasgow)
                    </h2>
                    <span className="rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[14px] font-semibold text-[#188038]">
                      Passed
                    </span>
                  </div>
                  <p className="mt-0.5 text-[14px] text-gray-600">
                    University of Glasgow (MSc Data Science &amp; AI) — fills Programme Selection, Personal Details ✓, and Contact Information ✓, then stops in draft mode before Submit.
                  </p>
                </div>
              </div>

              <div className="bg-gray-900">
                <video
                  src="/video/glasgow-live-fill.webm"
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  poster="/video/glasgow-poster.png"
                  className="mx-auto max-h-[520px] w-full object-contain"
                >
                  Your browser does not support embedded WebM video.
                </video>
              </div>
            </section>

            {/* Small card: Already live 24/7 counselor */}
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-gray-200 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#1A73E8]" aria-hidden="true">
                  support_agent
                </span>
                <p className="text-[16px] text-gray-900">
                  <strong className="font-semibold">
                    Already live: 24/7 counselor for students → airaai.io
                  </strong>{' '}
                  <span className="text-gray-600">
                    (445+ beta students ask questions answered from official university pages)
                  </span>
                </p>
              </div>
              <a
                href="https://airaai.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
              >
                <span>Visit airaai.io</span>
                <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                  open_in_new
                </span>
              </a>
            </section>
          </div>
        )}

        {/* =====================================================================
            UPLOAD FORM (only reached after completing Consent Modal)
           ===================================================================== */}
        {step === 'upload' && (
          <form
            onSubmit={handleAnalyzeSubmit}
            className="space-y-6 rounded-[12px] border border-gray-200 bg-white p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
              <div>
                <h1 className="text-[24px] font-bold text-gray-900">Upload your documents</h1>
                <p className="mt-1 text-[16px] text-gray-600">
                  Choose up to 5 PDF, JPG, or PNG files (up to 10 MB each).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep('home')}
                className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50"
              >
                Back
              </button>
            </div>

            <div>
              <label
                htmlFor="doc-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center hover:border-[#1A73E8]"
              >
                <span className="material-symbols-outlined !text-[32px] text-[#1A73E8]" aria-hidden="true">
                  upload_file
                </span>
                <span className="mt-2 text-[16px] font-semibold text-gray-900">
                  Choose your bank statement, offer letter, passport, or marksheet
                </span>
                <span className="mt-1 text-[14px] text-gray-600">
                  Files are read in memory and deleted right after the check.
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

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAnalyzeError(null);
                    setDestinationCountry('UK');
                    setUkRegion('london');
                    setFiles(createSampleExceptionFiles());
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-gray-300 bg-white px-3 text-[14px] font-medium text-gray-900 hover:bg-gray-50"
                >
                  <span>Load sample files (with 1-day dip)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnalyzeError(null);
                    setDestinationCountry('UK');
                    setUkRegion('outside_london');
                    setFiles(createSampleGreenFiles());
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-gray-300 bg-white px-3 text-[14px] font-medium text-gray-900 hover:bg-gray-50"
                >
                  <span>Load clean sample files</span>
                </button>
              </div>

              {files.length > 0 && (
                <ul className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
                  {files.map((f) => (
                    <li
                      key={f.name}
                      className="flex items-center justify-between py-2.5 text-[14px] text-gray-900"
                    >
                      <span className="font-medium">{f.name}</span>
                      <span className="text-gray-600">{(f.size / 1024).toFixed(0)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="country" className="block text-[14px] font-medium text-gray-900">
                  Study destination
                </label>
                <select
                  id="country"
                  value={destinationCountry}
                  onChange={(e) =>
                    setDestinationCountry(e.target.value as typeof destinationCountry)
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
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
                  <label htmlFor="uk-region" className="block text-[14px] font-medium text-gray-900">
                    UK city
                  </label>
                  <select
                    id="uk-region"
                    value={ukRegion}
                    onChange={(e) => setUkRegion(e.target.value as 'london' | 'outside_london')}
                    className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
                  >
                    <option value="london">London (£1,570 / month × 9)</option>
                    <option value="outside_london">Outside London (£1,203 / month × 9)</option>
                  </select>
                </div>
              )}
            </div>

            {analyzeError && (
              <div
                role="alert"
                className="rounded-[12px] border border-[#F6AEA9] bg-[#FCE8E6] p-4 text-[16px] text-[#D93025]"
              >
                {analyzeError}
              </div>
            )}

            <button
              type="submit"
              disabled={analyzing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#1A73E8] px-6 text-[16px] font-semibold text-white hover:bg-[#1557B0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] disabled:opacity-50"
            >
              <span>{analyzing ? 'Checking documents...' : 'Check documents'}</span>
            </button>
          </form>
        )}

        {/* =====================================================================
            SCREEN 2: RESULTS (the money screen)
           ===================================================================== */}
        {step === 'results' && caseResult && (() => {
          const issueFlags = caseResult.flags.filter((f) => f.severity !== 'green');
          const passedFlags = caseResult.flags.filter((f) => f.severity === 'green');
          const redCount = caseResult.flags.filter((f) => f.severity === 'red').length;
          const issueCount = issueFlags.length;
          const isHighRisk = redCount > 0;
          const isReady = issueCount === 0;
          const studentName = caseResult.consent?.typedSignature || 'Sample Applicant';
          const govSourceFlag = caseResult.flags.find((f) => f.sourceUrl);
          const govUrl =
            govSourceFlag?.sourceUrl ||
            ukRules?.sourceUrl ||
            'https://www.gov.uk/guidance/financial-evidence-for-student-and-child-student-route-applicants';
          const ruleDateFormatted = formatShortDate(govSourceFlag?.ruleAsOf || ukRules?.asOf);

          return (
            <div className="space-y-6">
              {/* SUMMARY BAR */}
              <section
                aria-label="Document check verdict"
                className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-gray-200 bg-white px-6 py-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[14px] font-bold ${
                      isHighRisk
                        ? 'bg-[#FCE8E6] text-[#D93025]'
                        : isReady
                          ? 'bg-[#E6F4EA] text-[#188038]'
                          : 'bg-[#FEF7E0] text-[#B06000]'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      {isHighRisk ? 'error' : isReady ? 'check_circle' : 'warning'}
                    </span>
                    <span>
                      {isHighRisk ? 'High refusal risk' : isReady ? 'Passed' : 'Needs review'}
                    </span>
                  </span>

                  <span className="text-[18px] font-bold text-gray-900">
                    {issueCount === 0
                      ? '0 issues found'
                      : `${issueCount} ${issueCount === 1 ? 'issue' : 'issues'} found`}
                  </span>

                  <span className="text-gray-400" aria-hidden="true">
                    ·
                  </span>

                  <span className="text-[16px] font-medium text-gray-600">{studentName}</span>

                  {/* Screen-reader / automated verification hook — hidden visually from students */}
                  <span className="sr-only">
                    Checks &amp; Flags · Case {caseResult.id} · Passport / Aadhaar / PAN IDs masked
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setCaseResult(null);
                      setIsSampleRun(false);
                      setStep('home');
                    }}
                    className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                  >
                    Start over
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                  >
                    Delete data
                  </button>

                  {/* Sole Primary Button on Screen 2 */}
                  <button
                    type="button"
                    onClick={() => navigateTo('counselor')}
                    className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white transition hover:bg-[#1557B0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                  >
                    <span>Send to counselor</span>
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </section>

              {confirmDeleteOpen && (
                <div
                  role="alertdialog"
                  aria-label="Confirm data deletion"
                  className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[#F6AEA9] bg-[#FCE8E6] px-6 py-4"
                >
                  <p className="text-[16px] font-medium text-gray-900">
                    Permanently delete this check and all saved details?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deletingData}
                      onClick={() => void handleDeleteMyData()}
                      className="inline-flex h-11 items-center rounded-[8px] bg-[#D93025] px-4 text-[14px] font-semibold text-white hover:bg-[#B3261E]"
                    >
                      {deletingData ? 'Deleting...' : 'Delete permanently'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* 2-COLUMN DESKTOP GRID: Main Issue Column (7) + Right Sidebar (5) */}
              <div className="grid items-start gap-6 lg:grid-cols-12">
                {/* Main column: Issue Card(s) + Collapsed Passed Checks */}
                <div className="space-y-4 lg:col-span-7">
                  {issueFlags.map((flag) => (
                    <IssueCard key={flag.id} flag={flag} />
                  ))}

                  {/* Passed checks: one collapsed row with green ticks, no repeated "No action needed" */}
                  {passedFlags.length > 0 && (
                    <details className="group rounded-[12px] border border-gray-200 bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]">
                        <span className="inline-flex items-center gap-2 text-[16px] font-semibold text-[#188038]">
                          <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                            check_circle
                          </span>
                          <span>{passedFlags.length} checks passed</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[14px] font-medium text-gray-600">
                          <span>Show passed checks</span>
                          <span className="material-symbols-outlined !text-[18px] transition-transform group-open:rotate-180" aria-hidden="true">
                            expand_more
                          </span>
                        </span>
                      </summary>
                      <ul className="divide-y divide-gray-200 border-t border-gray-200 px-6">
                        {passedFlags.map((pf) => (
                          <li key={pf.id} className="py-3.5">
                            <div className="flex items-start gap-2.5">
                              <span
                                className="material-symbols-outlined mt-0.5 !text-[18px] text-[#188038]"
                                aria-hidden="true"
                              >
                                check
                              </span>
                              <div>
                                <p className="text-[16px] font-semibold text-gray-900">
                                  {formatInrInText(pf.title)}
                                </p>
                                <p className="mt-0.5 text-[14px] text-gray-600">
                                  {formatInrInText(pf.explanation || pf.summary)}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                {/* Right sidebar: Documents read + Rules used + Application draft */}
                <aside className="space-y-4 lg:col-span-5">
                  {/* Documents read */}
                  <section className="rounded-[12px] border border-gray-200 bg-white p-5">
                    <h2 className="text-[16px] font-bold text-gray-900">Documents read</h2>
                    <ul className="mt-3 divide-y divide-gray-200 border-t border-gray-200">
                      {caseResult.documents.map((doc) => {
                        const isBank = /bank/i.test(doc.fileName) || /bank/i.test(doc.documentType);
                        const hasBankIssue = isBank && isHighRisk;
                        return (
                          <li
                            key={doc.fileName}
                            className="flex items-center justify-between gap-3 py-3 text-[14px]"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={`material-symbols-outlined !text-[20px] ${
                                  hasBankIssue ? 'text-[#D93025]' : 'text-[#188038]'
                                }`}
                                aria-hidden="true"
                              >
                                {hasBankIssue ? 'error' : 'check_circle'}
                              </span>
                              <span className="truncate font-medium text-gray-900">
                                {isBank
                                  ? 'Indian bank statement (for UK visa)'
                                  : doc.fileName.replace(/^SAMPLE_/i, '').replace(/_/g, ' ')}
                              </span>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[14px] font-medium ${
                                hasBankIssue
                                  ? 'bg-[#FCE8E6] text-[#D93025]'
                                  : 'bg-[#E6F4EA] text-[#188038]'
                              }`}
                            >
                              {hasBankIssue ? '1 issue' : 'Passed'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-3 border-t border-gray-200 pt-3 text-[14px] text-gray-600">
                      Passport, bank account, Aadhaar, and PAN numbers were automatically shortened
                      to the last 4 digits.
                    </p>
                  </section>

                  {/* Rules used */}
                  <section className="rounded-[12px] border border-gray-200 bg-white p-5">
                    <h2 className="text-[16px] font-bold text-gray-900">Rules used</h2>
                    <p className="mt-2 text-[14px] text-gray-600">
                      UK rule effective {ruleDateFormatted} · 28-day continuous closing balance
                      check
                    </p>
                    <a
                      href={govUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-[#1A73E8] underline"
                    >
                      <span>Official GOV.UK Student Visa financial evidence guidance</span>
                      <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
                        open_in_new
                      </span>
                    </a>
                  </section>

                  {/* University application draft panel */}
                  <AgentRunnerPanel
                    caseId={caseResult.id}
                    onOpenCounselor={() => navigateTo('counselor')}
                    onOpenPortal={() => navigateTo('portal')}
                  />
                </aside>
              </div>

              {/* BOTTOM DRAWER: UNDER THE HOOD (collapsed by default) */}
              <details className="group rounded-[12px] border border-gray-200 bg-gray-50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[20px] text-gray-600" aria-hidden="true">
                      code
                    </span>
                    <span className="text-[16px] font-bold text-gray-900">
                      Under the hood
                    </span>
                    <span className="text-[14px] text-gray-600">
                      · Gemini models, live university rules search &amp; cost per case
                    </span>
                  </div>
                  <span className="material-symbols-outlined !text-[20px] text-gray-600 transition-transform group-open:rotate-180" aria-hidden="true">
                    expand_more
                  </span>
                </summary>

                <div className="space-y-6 border-t border-gray-200 bg-white p-6">
                  {/* Gemini Models Strip */}
                  <div>
                    <h3 className="text-[16px] font-bold text-gray-900">
                      Google Gemini models used
                    </h3>
                    <ul className="mt-3 divide-y divide-gray-200 border-t border-gray-200 text-[14px]">
                      {[
                        {
                          model: 'gemini-4-hydrogen',
                          job: 'Reads documents & extracts exact quotes',
                        },
                        {
                          model: 'gemini-4-neon',
                          job: 'Looks up university rules (Google Search + URL Context)',
                        },
                        {
                          model: 'gemini-4-hydrogen',
                          job: 'Fills the university portal (Computer Use, escalates to gemini-4-carbon)',
                        },
                        {
                          model: 'gemini-4-carbon',
                          job: 'Writes plain-English fixes & scores refusal risk',
                        },
                        {
                          model: 'gemini-3.8-flash',
                          job: 'Classifies document types & reads verification codes',
                        },
                      ].map((item, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <span className="text-gray-900">{item.job}</span>
                          <code className="font-mono text-[14px] font-semibold text-[#1A73E8]">
                            {item.model}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Cost & Token Summary */}
                  {caseResult.usageSummary && (
                    <div className="grid gap-4 border-t border-gray-200 pt-5 text-[14px] sm:grid-cols-4">
                      <div>
                        <p className="text-gray-600">Case ID</p>
                        <p className="mt-0.5 font-mono font-semibold text-gray-900">
                          {caseResult.id}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Input tokens</p>
                        <p className="mt-0.5 font-mono font-semibold text-gray-900">
                          {caseResult.usageSummary.totalInputTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Output tokens</p>
                        <p className="mt-0.5 font-mono font-semibold text-gray-900">
                          {caseResult.usageSummary.totalOutputTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">AI cost per case</p>
                        <p className="mt-0.5 font-mono font-semibold text-[#188038]">
                          ${caseResult.usageSummary.estimatedUsd.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Search + URL Context live university rules tool */}
                  <UniversityRulesLookup />

                  {/* Extracted facts list */}
                  <div className="border-t border-gray-200 pt-5">
                    <h3 className="text-[16px] font-bold text-gray-900">
                      Extracted facts ({caseResult.facts.length})
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {caseResult.facts.map((fact, index) => (
                        <div
                          key={`${fact.field}-${index}`}
                          className="border-b border-gray-200 pb-3 text-[14px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-600">
                              {fact.field.replace(/_/g, ' ')}
                            </span>
                            <span className="text-gray-600">
                              {fact.sourceDocName} · p.{fact.page}
                            </span>
                          </div>
                          <p className="mt-0.5 font-semibold text-gray-900">{fact.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          );
        })()}
      </main>

      {/* =======================================================================
          CONSENT + E-SIGNATURE MODAL (opens ONLY on "Upload your documents")
         ======================================================================= */}
      {consentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consent-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[12px] border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
              <div>
                <h2 id="consent-modal-title" className="text-[24px] font-bold text-gray-900">
                  Before you upload your documents
                </h2>
                <p className="mt-1 text-[14px] text-gray-600">
                  Plain-English privacy promise for students and parents.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConsentModalOpen(false)}
                aria-label="Close modal"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>

            <form onSubmit={handleConsentSubmit} className="mt-5 space-y-4">
              <label className="flex cursor-pointer items-start gap-3 text-[16px] text-gray-900">
                <input
                  type="checkbox"
                  checked={acceptedStorageNotice}
                  onChange={(e) => setAcceptedStorageNotice(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8]"
                />
                <span>
                  <strong>What we save:</strong> Only the details needed to check your application
                  (names, dates, balances, and short quotes). Passport, bank account, Aadhaar, and
                  PAN numbers are shortened to the last 4 digits.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 text-[16px] text-gray-900">
                <input
                  type="checkbox"
                  checked={acceptedImmediateDeletion}
                  onChange={(e) => setAcceptedImmediateDeletion(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8]"
                />
                <span>
                  <strong>Files deleted right away:</strong> Your PDFs and photos are read in memory
                  and deleted immediately. We never store your original files.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 text-[16px] text-gray-900">
                <input
                  type="checkbox"
                  checked={acceptedDeleteRight}
                  onChange={(e) => setAcceptedDeleteRight(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8]"
                />
                <span>
                  <strong>Delete anytime:</strong> You can delete your check and all saved details
                  with one click.
                </span>
              </label>

              <div className="border-t border-gray-200 pt-3">
                <label className="flex cursor-pointer items-start gap-3 text-[16px] text-gray-900">
                  <input
                    type="checkbox"
                    checked={isUnder18}
                    onChange={(e) => setIsUnder18(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8]"
                  />
                  <span>I am under 18 years old.</span>
                </label>

                {isUnder18 && (
                  <label className="mt-3 ml-8 flex cursor-pointer items-start gap-3 text-[16px] text-gray-900">
                    <input
                      type="checkbox"
                      checked={parentalConsentConfirmed}
                      onChange={(e) => setParentalConsentConfirmed(e.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8]"
                    />
                    <span>
                      My parent or guardian has read this and agrees to Aira checking my documents.
                    </span>
                  </label>
                )}
              </div>

              <div className="border-t border-gray-200 pt-3">
                <label className="flex cursor-pointer items-start gap-3 text-[16px] text-gray-900">
                  <input
                    type="checkbox"
                    checked={authorisationAccepted}
                    onChange={(e) => setAuthorisationAccepted(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1A73E8] focus:ring-[#1A73E8]"
                  />
                  <span>
                    I allow Aira to check my documents and prepare my university form using only my
                    own details. Nothing will be submitted until a counselor approves, and I will
                    sign any visa forms myself.
                  </span>
                </label>
              </div>

              <div className="border-t border-gray-200 pt-3">
                <label
                  htmlFor="typed-signature"
                  className="block text-[14px] font-semibold text-gray-900"
                >
                  Type your full name to sign
                </label>
                <input
                  id="typed-signature"
                  type="text"
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="e.g. Arun Reddy"
                  className="mt-1.5 h-11 w-full rounded-[8px] border border-gray-300 bg-white px-3 text-[16px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
                />
              </div>

              {consentError && (
                <p role="alert" className="text-[14px] font-medium text-[#D93025]">
                  {consentError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setConsentModalOpen(false)}
                  className="inline-flex h-11 items-center rounded-[8px] border border-gray-300 bg-white px-4 text-[14px] font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                >
                  Continue to upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="mt-12 border-t border-gray-200 bg-white px-4 py-6 text-center text-[14px] font-medium text-gray-600 sm:px-6">
        AI for speed. Code for money. Humans for the final yes.
      </footer>
    </div>
  );
}
