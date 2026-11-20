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
    setRunningSample(true);
    setSampleError(null);
    setAnalyzeError(null);
    setDeleteConfirmationMsg(null);

    try {
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
      setFiles(sampleFiles);
      setDestinationCountry('UK');
      setUkRegion('london');
      setIsSampleRun(true);

      const formData = new FormData();
      for (const f of sampleFiles) {
        formData.append('documents', f);
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

      const res = await fetch('/api/cases/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Could not run sample check.');
      }

      setCaseResult(data as CaseRecord);
      setStep('results');
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
      setSampleError(err instanceof Error ? err.message : 'Sample check failed.');
    } finally {
      setRunningSample(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6] text-slate-900">
      <a
        href="#student-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#2563EB] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <TopNav
        activeRoute="student"
        onNavigate={navigateTo}
        checkCompleted={step === 'results' && Boolean(caseResult)}
        showDemoPill={isSampleRun}
      />

      <main id="student-main" className="flex-1">
        {/* =====================================================================
            SCREEN 1: HOME — AIRBNB / SLACK / STRIPE EDITORIAL LANDING PAGE
           ===================================================================== */}
        {step === 'home' && (
          <div>
            {/* BAND 1: HERO (Warm Porcelain Canvas) */}
            <section className="bg-[#FAF9F6] pb-14 pt-10 sm:pb-20 sm:pt-14">
              <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
                <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
                  {/* Left: Editorial Copy + Country Selector + Pill CTAs */}
                  <div className="space-y-6 lg:col-span-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 shadow-2xs">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span>24/7 Study Abroad AI Counselor + Computer Agent</span>
                    </div>

                    <h1 className="font-display text-[36px] font-extrabold leading-[1.1] tracking-tight text-slate-950 sm:text-[46px]">
                      Your global admit, on autopilot — approved by a human.
                    </h1>

                    <p className="max-w-[540px] text-[17px] leading-relaxed text-slate-600">
                      AIRA AI verifies your documents, prepares tailored study-abroad applications,
                      and fills university portals for you — with an in-house human counselor
                      signing off before anything is submitted.
                    </p>

                    {/* Country Rule Pack Selector (UI only) */}
                    <div className="space-y-2.5" role="group" aria-label="Destination country rule pack">
                      <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">
                        Active country rule packs
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          aria-current="true"
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#2563EB] bg-blue-50/90 px-3.5 text-[14px] font-semibold text-[#1D4ED8]"
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                          <span>United Kingdom</span>
                          <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                            Live
                          </span>
                        </span>

                        {['USA', 'Canada', 'Germany', 'Ireland'].map((country) => (
                          <span
                            key={country}
                            aria-disabled="true"
                            className="inline-flex h-9 cursor-not-allowed select-none items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3.5 text-[14px] font-medium text-slate-400"
                          >
                            <span>{country}</span>
                            <span className="text-[11px] font-semibold uppercase text-slate-400">
                              Next
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Primary + Secondary Pill CTAs */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        disabled={runningSample || analyzing}
                        onClick={() => void handleRunSampleCase()}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#2563EB] px-6 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                          play_arrow
                        </span>
                        <span>
                          {runningSample ? 'Running live demo...' : 'Run Live Demo (30 sec)'}
                        </span>
                        <span className="sr-only">Try with sample documents</span>
                      </button>

                      <button
                        type="button"
                        disabled={runningSample || analyzing}
                        onClick={() => {
                          setConsentError(null);
                          setConsentModalOpen(true);
                        }}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-[15px] font-semibold text-slate-900 shadow-2xs transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                      >
                        <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                          upload_file
                        </span>
                        <span>Upload Documents</span>
                      </button>
                    </div>

                    {/* Crisp Trust Strip */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-[14px] font-medium text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600" aria-hidden="true">
                          verified
                        </span>
                        Zero college kickbacks
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600" aria-hidden="true">
                          memory
                        </span>
                        Files read in memory
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600" aria-hidden="true">
                          shield_person
                        </span>
                        Human approves every submit
                      </span>
                    </div>
                  </div>

                  {/* Right: High-Craft Hero Editorial Artwork + Floating Frosted-Glass Status Chips */}
                  <div className="relative lg:col-span-6">
                    <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                      <img
                        src="/img/hero-study-abroad.jpg"
                        alt="Indian student preparing study abroad applications with AIRA AI 24/7 counselor, portal automation, and human counselor approval"
                        className="h-auto w-full rounded-[22px] object-cover"
                      />

                      {/* Floating Glass Card 1: Top-Left */}
                      <div className="absolute left-5 top-5 hidden items-center gap-2 rounded-2xl border border-white/80 bg-white/92 px-3.5 py-2 shadow-md backdrop-blur-md sm:flex">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[#2563EB]">
                          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
                            support_agent
                          </span>
                        </span>
                        <div>
                          <p className="text-[12px] font-bold leading-tight text-slate-900">
                            24/7 AI Active
                          </p>
                          <p className="text-[11px] font-medium text-slate-500">
                            Official university rules
                          </p>
                        </div>
                      </div>

                      {/* Floating Glass Card 2: Bottom-Right */}
                      <div className="absolute bottom-5 right-5 flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                            verified_user
                          </span>
                        </span>
                        <div>
                          <p className="text-[13px] font-bold leading-tight text-slate-950">
                            Portal Filled · Human Locked
                          </p>
                          <p className="text-[12px] font-medium text-emerald-700">
                            Ready for counselor sign-off
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live status / error banners */}
                {runningSample && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-8 flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-5 py-4 text-[15px] font-medium text-slate-900 shadow-xs"
                  >
                    <span className="material-symbols-outlined animate-spin text-[#2563EB]" aria-hidden="true">
                      progress_activity
                    </span>
                    <span>
                      Verifying sample offer letter, financial bank statement, and academic
                      marksheet against official rules...
                    </span>
                  </div>
                )}

                {sampleError && (
                  <div
                    role="alert"
                    className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-[15px] font-medium text-red-700"
                  >
                    {sampleError}
                  </div>
                )}

                {deleteConfirmationMsg && (
                  <div
                    role="status"
                    className="mt-8 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[15px] font-medium text-emerald-800"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      check_circle
                    </span>
                    <span>{deleteConfirmationMsg}</span>
                  </div>
                )}
              </div>
            </section>

            {/* BAND 2: WHO IT'S BUILT FOR — 3 EDITORIAL BENTO CARDS WITH BESPOKE ARTWORK */}
            <section className="border-t border-slate-200/70 bg-white py-16 sm:py-20">
              <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
                <div className="mx-auto max-w-2xl text-center">
                  <p className="text-[13px] font-bold uppercase tracking-widest text-[#2563EB]">
                    What we are building
                  </p>
                  <h2 className="mt-2 font-display text-[30px] font-extrabold tracking-tight text-slate-950 sm:text-[36px]">
                    Built for students, 10x counselors, and global universities.
                  </h2>
                  <p className="mt-3 text-[16px] leading-relaxed text-slate-600">
                    1.3 million Indian students go abroad every year — yet still wait through
                    weekends on slow, commission-driven agencies. AIRA combines AI execution speed
                    with real human accountability.
                  </p>
                </div>

                <div className="mt-12 grid gap-8 lg:grid-cols-3">
                  {/* Bento Card 1: For Students — Speed Mode */}
                  <article className="flex flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-[#FAF9F6] transition hover:shadow-md">
                    <div className="aspect-[4/3] w-full overflow-hidden border-b border-slate-200/60 bg-white">
                      <img
                        src="/img/pillar-students.jpg"
                        alt="24/7 AI study abroad counselor and speed mode for students"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <span className="inline-flex w-fit items-center rounded-full bg-orange-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-orange-700">
                        For Students · Speed Mode
                      </span>
                      <h3 className="mt-3 font-display text-[21px] font-bold text-slate-950">
                        24/7 AI guidance &amp; instant document prep
                      </h3>
                      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">
                        High school seniors, undergrads, and working graduates across India (next:
                        UAE &amp; Nepal) upload transcripts and proofs once. Get 24/7 answers from
                        official university pages, tailored SOP help, and verified document checks
                        without weekend delays.
                      </p>
                      <div className="mt-5 border-t border-slate-200/80 pt-4">
                        <a
                          href="https://airaai.io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#2563EB] hover:underline"
                        >
                          <span>445+ beta users live at airaai.io</span>
                          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
                            open_in_new
                          </span>
                        </a>
                      </div>
                    </div>
                  </article>

                  {/* Bento Card 2: Computer Agent — Portal Auto-Fill */}
                  <article className="flex flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-[#FAF9F6] transition hover:shadow-md">
                    <div className="aspect-[4/3] w-full overflow-hidden border-b border-slate-200/60 bg-white">
                      <img
                        src="/img/pillar-computer-agent.jpg"
                        alt="AI computer agent auto-filling university portals and locking Submit for human approval"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-[#2563EB]">
                        Computer Agent · Time Saver
                      </span>
                      <h3 className="mt-3 font-display text-[21px] font-bold text-slate-950">
                        Fills university portals in minutes, safely locked
                      </h3>
                      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">
                        Instead of manually re-typing the same education history across 8 complex
                        portals, AIRA&apos;s browser agent fills every form field from verified
                        facts and hard-locks final Submit until a human approves.
                      </p>
                      <div className="mt-5 border-t border-slate-200/80 pt-4 text-[14px] font-semibold text-slate-700">
                        Saves 10+ hours per student · Zero hallucinated entries
                      </div>
                    </div>
                  </article>

                  {/* Bento Card 3: 10x Counselors & Vetted University Applicants */}
                  <article className="flex flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-[#FAF9F6] transition hover:shadow-md">
                    <div className="aspect-[4/3] w-full overflow-hidden border-b border-slate-200/60 bg-white">
                      <img
                        src="/img/pillar-counselor-uni.jpg"
                        alt="10x counselor workspace verifying student files and sending vetted applicant packets to universities"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-emerald-700">
                        10x Counselors &amp; Universities
                      </span>
                      <h3 className="mt-3 font-display text-[21px] font-bold text-slate-950">
                        500+ apps per counselor · Vetted applicants
                      </h3>
                      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">
                        Manual counselors max out at 25–30 students a day. AIRA&apos;s admin
                        workspace lets 1 human counselor verify 500+ applications calmly — sending
                        universities fraud-checked, pre-verified applicant files.
                      </p>
                      <div className="mt-5 border-t border-slate-200/80 pt-4 text-[14px] font-semibold text-emerald-700">
                        Single-use approval token unlocks every Submit
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </section>

            {/* BAND 3: WATCH LIVE COMPUTER AGENT VIDEO PROOF (UNIVERSITY OF GLASGOW) */}
            <section className="border-t border-slate-200/70 bg-[#F4F6FB] py-16 sm:py-20">
              <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="max-w-2xl">
                    <p className="text-[13px] font-bold uppercase tracking-widest text-[#2563EB]">
                      Live Computer Agent Proof
                    </p>
                    <h2 className="mt-2 font-display text-[28px] font-extrabold tracking-tight text-slate-950 sm:text-[34px]">
                      Watch AIRA fill a real University of Glasgow application.
                    </h2>
                    <p className="mt-2 text-[16px] text-slate-600">
                      Full uncut 15 min 58 sec session (16x timelapse, zero skips) — filling
                      Programme Selection, Personal Details, and Contact Information, then pausing
                      safely in draft mode before Submit.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      'Programme Selection ✓',
                      'Personal Details ✓',
                      'Contact Info ✓',
                      'Paused before Submit ✓',
                    ].map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-800"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-8 overflow-hidden rounded-[24px] border border-slate-300/70 bg-slate-950 shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
                  <video
                    src="/video/glasgow-live-fill.webm"
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    poster="/video/glasgow-poster.png"
                    className="mx-auto max-h-[540px] w-full object-contain"
                  >
                    Your browser does not support embedded WebM video.
                  </video>
                </div>
              </div>
            </section>

            {/* BAND 4: TRANSPARENT PRICING ($99 ONLY — ZERO COLLEGE KICKBACKS) */}
            <section className="border-t border-slate-200/70 bg-white py-16 sm:py-20">
              <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
                <div className="mx-auto max-w-2xl text-center">
                  <p className="text-[13px] font-bold uppercase tracking-widest text-[#2563EB]">
                    Transparent SaaS Pricing
                  </p>
                  <h2 className="mt-2 font-display text-[30px] font-extrabold tracking-tight text-slate-950 sm:text-[36px]">
                    Paid by students, never by partner college kickbacks.
                  </h2>
                  <p className="mt-3 text-[16px] text-slate-600">
                    Start with a free document readiness check. Upgrade only when you are ready to
                    apply.
                  </p>
                </div>

                <div className="mt-12 grid gap-6 lg:grid-cols-3">
                  {/* Students: ONLY $99 */}
                  <div className="flex flex-col rounded-[24px] border-2 border-[#2563EB] bg-white p-7 shadow-[0_12px_32px_rgba(37,99,235,0.08)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-bold uppercase tracking-wide text-[#2563EB]">
                        For Students
                      </span>
                      <span className="rounded-full bg-blue-50 px-3 py-0.5 text-[12px] font-bold text-[#2563EB]">
                        Most Popular
                      </span>
                    </div>
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="font-display text-[42px] font-extrabold tracking-tight text-slate-950">
                        $99
                      </span>
                      <span className="text-[15px] font-medium text-slate-500">
                        / 2 university applications
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] text-slate-600">
                      Usage-based SaaS that scales smoothly as you add more universities or target
                      countries.
                    </p>
                    <ul className="mt-6 flex-1 space-y-3 border-t border-slate-100 pt-5 text-[14px] text-slate-700">
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Free initial document readiness check
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        24/7 AI guidance &amp; tailored SOP drafting
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Computer agent fills portals + human sign-off
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Zero hidden university commissions
                      </li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => void handleRunSampleCase()}
                      className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#2563EB] px-5 text-[15px] font-semibold text-white transition hover:bg-[#1D4ED8]"
                    >
                      Try free check now
                    </button>
                  </div>

                  {/* Independent Counselors */}
                  <div className="flex flex-col rounded-[24px] border border-slate-200 bg-[#FAF9F6] p-7">
                    <span className="text-[14px] font-bold uppercase tracking-wide text-slate-600">
                      For Independent Counselors
                    </span>
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="font-display text-[32px] font-extrabold tracking-tight text-slate-950">
                        10x Workspace
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] text-slate-600">
                      Per-student B2B admin seats so independent counselors bring their own
                      students onto AIRA.
                    </p>
                    <ul className="mt-6 flex-1 space-y-3 border-t border-slate-200/70 pt-5 text-[14px] text-slate-700">
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        1 counselor verifies 500+ applications calmly
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Single-use approval tokens &amp; full audit log
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Transparent live status for every student
                      </li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => navigateTo('counselor')}
                      className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50"
                    >
                      Open Admin Workspace
                    </button>
                  </div>

                  {/* Universities & Post-Admit */}
                  <div className="flex flex-col rounded-[24px] border border-slate-200 bg-[#FAF9F6] p-7">
                    <span className="text-[14px] font-bold uppercase tracking-wide text-slate-600">
                      For Universities &amp; Partners
                    </span>
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="font-display text-[42px] font-extrabold tracking-tight text-slate-950">
                        $40
                      </span>
                      <span className="text-[15px] font-medium text-slate-500">
                        / verified packet
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] text-slate-600">
                      Fast-track admissions with fraud-checked, quote-backed applicant files plus
                      post-admit support.
                    </p>
                    <ul className="mt-6 flex-1 space-y-3 border-t border-slate-200/70 pt-5 text-[14px] text-slate-700">
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Verified transcripts &amp; financial readiness
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Human-signed compliance trail per applicant
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-emerald-600">check_circle</span>
                        Post-admit education loans &amp; housing partners
                      </li>
                    </ul>
                    <a
                      href="https://airaai.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-6 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-5 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50"
                    >
                      <span>Partner via airaai.io</span>
                      <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">
                        open_in_new
                      </span>
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* BAND 5: LIVE PRODUCTION BANNER (airaai.io) */}
            <section className="bg-[#FAF9F6] py-12">
              <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-slate-950 px-8 py-9 text-white shadow-lg">
                  <div className="max-w-2xl">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                      Live in Production
                    </span>
                    <h2 className="mt-3 font-display text-[26px] font-extrabold leading-tight sm:text-[30px]">
                      Already helping 445+ beta students &amp; 4,000+ community members at airaai.io
                    </h2>
                    <p className="mt-2 text-[15px] text-slate-300">
                      Starting across India, expanding next to UAE, Nepal, and Europe — one
                      transparent cloud SaaS platform from shortlist to arrival.
                    </p>
                  </div>
                  <a
                    href="https://airaai.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-bold text-slate-950 transition hover:bg-slate-100"
                  >
                    <span>Visit airaai.io</span>
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      open_in_new
                    </span>
                  </a>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* =====================================================================
            UPLOAD FORM (only reached after completing Consent Modal)
           ===================================================================== */}
        {step === 'upload' && (
          <div className="mx-auto max-w-[920px] px-4 py-10 sm:px-6">
            <form
              onSubmit={handleAnalyzeSubmit}
              className="space-y-6 rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-xs sm:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
                <div>
                  <h1 className="font-display text-[26px] font-extrabold text-slate-950">
                    Upload your documents
                  </h1>
                  <p className="mt-1 text-[15px] text-slate-600">
                    Choose up to 5 PDF, JPG, or PNG files (up to 10 MB each). Read in memory only.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('home')}
                  className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Back
                </button>
              </div>

              <div>
                <label
                  htmlFor="doc-upload"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-[#FAF9F6] px-6 py-10 text-center transition hover:border-[#2563EB]"
                >
                  <span className="material-symbols-outlined !text-[36px] text-[#2563EB]" aria-hidden="true">
                    upload_file
                  </span>
                  <span className="mt-2 font-display text-[17px] font-bold text-slate-950">
                    Choose your offer letter, bank statement, passport, or marksheet
                  </span>
                  <span className="mt-1 text-[14px] text-slate-500">
                    Files are parsed in memory and deleted right after verification.
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
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <span>Load sample packet (flagged case)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyzeError(null);
                      setDestinationCountry('UK');
                      setUkRegion('outside_london');
                      setFiles(createSampleGreenFiles());
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <span>Load clean sample packet</span>
                  </button>
                </div>

                {files.length > 0 && (
                  <ul className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
                    {files.map((f) => (
                      <li
                        key={f.name}
                        className="flex items-center justify-between py-2.5 text-[14px] text-slate-900"
                      >
                        <span className="font-semibold">{f.name}</span>
                        <span className="text-slate-500">{(f.size / 1024).toFixed(0)} KB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="country" className="block text-[14px] font-semibold text-slate-900">
                    Study destination
                  </label>
                  <select
                    id="country"
                    value={destinationCountry}
                    onChange={(e) =>
                      setDestinationCountry(
                        e.target.value as 'UK' | 'US' | 'Canada' | 'Australia' | 'Germany' | 'Other'
                      )
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                  >
                    <option value="UK">United Kingdom (Live rule pack)</option>
                    <option value="US">United States</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                    <option value="Germany">Germany</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {destinationCountry === 'UK' ? (
                  <div>
                    <label htmlFor="uk-region" className="block text-[14px] font-semibold text-slate-900">
                      University location
                    </label>
                    <select
                      id="uk-region"
                      value={ukRegion}
                      onChange={(e) => setUkRegion(e.target.value as 'london' | 'outside_london')}
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                    >
                      <option value="london">London</option>
                      <option value="outside_london">Outside London</option>
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label htmlFor="req-cost" className="block text-[14px] font-semibold text-slate-900">
                        Required 1st-year cost
                      </label>
                      <input
                        id="req-cost"
                        type="number"
                        value={requiredCostAmount}
                        onChange={(e) => setRequiredCostAmount(e.target.value)}
                        placeholder="e.g. 45000"
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="req-curr" className="block text-[14px] font-semibold text-slate-900">
                        Currency
                      </label>
                      <select
                        id="req-curr"
                        value={requiredCostCurrency}
                        onChange={(e) => setRequiredCostCurrency(e.target.value)}
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-2.5 text-[15px]"
                      >
                        <option value="USD">USD</option>
                        <option value="GBP">GBP</option>
                        <option value="EUR">EUR</option>
                        <option value="CAD">CAD</option>
                        <option value="AUD">AUD</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {analyzeError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] font-medium text-red-700"
                >
                  {analyzeError}
                </div>
              )}

              <div className="flex justify-end border-t border-slate-200 pt-4">
                <button
                  type="submit"
                  disabled={analyzing}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-[#2563EB] px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50"
                >
                  <span>{analyzing ? 'Verifying documents...' : 'Verify my documents'}</span>
                  <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                    arrow_forward
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* =====================================================================
            SCREEN 2: RESULTS — APPLICATION READINESS & DOCUMENT CHECK
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
            <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-8 sm:px-6">
              {/* Page Title */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="font-display text-[26px] font-extrabold tracking-tight text-slate-950">
                    UK funds check &amp; application readiness
                  </h1>
                  <p className="text-[14px] text-slate-600">
                    United Kingdom rule pack (Live) · Automated document verification before
                    counselor approval
                  </p>
                </div>
              </div>

              {/* SUMMARY BAR */}
              <section
                aria-label="Document check verdict"
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-6 py-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[13px] font-bold ${
                      isHighRisk
                        ? 'bg-red-50 text-red-700'
                        : isReady
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      {isHighRisk ? 'error' : isReady ? 'check_circle' : 'warning'}
                    </span>
                    <span>
                      {isHighRisk ? 'High risk' : isReady ? 'Ready to submit' : 'Needs review'}
                    </span>
                  </span>

                  <span className="font-display text-[18px] font-bold text-slate-950">
                    {issueCount === 0
                      ? '0 issues found'
                      : `${issueCount} ${issueCount === 1 ? 'issue' : 'issues'} found`}
                  </span>

                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>

                  <span className="text-[15px] font-medium text-slate-600">{studentName}</span>

                  {/* Screen-reader / automated verification hook */}
                  <span className="sr-only">
                    Checks &amp; Flags · Case {caseResult.id} · Passport / Aadhaar / PAN IDs masked ·
                    UK 28-day funds check · Verbatim Quote Evidence
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
                    className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Start over
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Delete data
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateTo('counselor')}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[#2563EB] px-5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#1D4ED8]"
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
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-4"
                >
                  <p className="text-[15px] font-semibold text-slate-900">
                    Permanently delete this check and all saved details?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deletingData}
                      onClick={() => void handleDeleteMyData()}
                      className="inline-flex h-10 items-center rounded-full bg-red-600 px-5 text-[14px] font-semibold text-white hover:bg-red-700"
                    >
                      {deletingData ? 'Deleting...' : 'Delete permanently'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* 2-COLUMN DESKTOP GRID */}
              <div className="grid items-start gap-6 lg:grid-cols-12">
                {/* Main column: Issue Card(s) + Collapsed Passed Checks */}
                <div className="space-y-4 lg:col-span-7">
                  {issueFlags.map((flag) => (
                    <IssueCard key={flag.id} flag={flag} />
                  ))}

                  {passedFlags.length > 0 && (
                    <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">
                        <span className="inline-flex items-center gap-2 text-[15px] font-bold text-emerald-700">
                          <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                            check_circle
                          </span>
                          <span>{passedFlags.length} checks passed</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[14px] font-medium text-slate-500">
                          <span>Show passed checks</span>
                          <span className="material-symbols-outlined !text-[18px] transition-transform group-open:rotate-180" aria-hidden="true">
                            expand_more
                          </span>
                        </span>
                      </summary>
                      <ul className="divide-y divide-slate-200/80 border-t border-slate-200/80 px-6">
                        {passedFlags.map((pf) => (
                          <li key={pf.id} className="py-3.5">
                            <div className="flex items-start gap-2.5">
                              <span
                                className="material-symbols-outlined mt-0.5 !text-[18px] text-emerald-600"
                                aria-hidden="true"
                              >
                                check
                              </span>
                              <div>
                                <p className="text-[15px] font-semibold text-slate-900">
                                  {formatInrInText(pf.title)}
                                </p>
                                <p className="mt-0.5 text-[14px] text-slate-600">
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

                {/* Right sidebar: Documents verified + Official rules + Computer Agent runner */}
                <aside className="space-y-4 lg:col-span-5">
                  <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
                    <h2 className="font-display text-[16px] font-bold text-slate-950">
                      Documents verified
                    </h2>
                    <ul className="mt-3 divide-y divide-slate-200/70 border-t border-slate-200/70">
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
                                  hasBankIssue ? 'text-red-600' : 'text-emerald-600'
                                }`}
                                aria-hidden="true"
                              >
                                {hasBankIssue ? 'error' : 'check_circle'}
                              </span>
                              <span className="truncate font-medium text-slate-900">
                                {isBank
                                  ? 'Indian bank statement (UK rule check)'
                                  : doc.fileName.replace(/^SAMPLE_/i, '').replace(/_/g, ' ')}
                              </span>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                                hasBankIssue
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {hasBankIssue ? '1 issue' : 'Passed'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-3 border-t border-slate-200/70 pt-3 text-[13px] text-slate-500">
                      Passport, bank account, Aadhaar, and PAN numbers are automatically masked to
                      the last 4 digits.
                    </p>
                  </section>

                  <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
                    <h2 className="font-display text-[16px] font-bold text-slate-950">
                      Official rules referenced
                    </h2>
                    <p className="mt-2 text-[14px] text-slate-600">
                      UK rule pack effective {ruleDateFormatted} · 28-day continuous closing balance
                      requirement
                    </p>
                    <a
                      href={govUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-[#2563EB] hover:underline"
                    >
                      <span>Official GOV.UK financial evidence guidance</span>
                      <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
                        open_in_new
                      </span>
                    </a>
                  </section>

                  <AgentRunnerPanel
                    caseId={caseResult.id}
                    onOpenCounselor={() => navigateTo('counselor')}
                    onOpenPortal={() => navigateTo('portal')}
                  />
                </aside>
              </div>

              {/* BOTTOM DRAWER: UNDER THE HOOD */}
              <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[20px] text-slate-500" aria-hidden="true">
                      code
                    </span>
                    <span className="font-display text-[15px] font-bold text-slate-950">
                      Under the hood
                    </span>
                    <span className="text-[14px] text-slate-500">
                      · Gemini models, live official rules search &amp; cost per case
                    </span>
                  </div>
                  <span className="material-symbols-outlined !text-[20px] text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">
                    expand_more
                  </span>
                </summary>

                <div className="space-y-6 border-t border-slate-200/80 bg-[#FAF9F6] p-6">
                  <div>
                    <h3 className="font-display text-[15px] font-bold text-slate-950">
                      Google Gemini models used
                    </h3>
                    <ul className="mt-3 divide-y divide-slate-200 border-t border-slate-200 text-[14px]">
                      {[
                        {
                          model: 'gemini-4-hydrogen',
                          job: 'Reads documents with verbatim quotes & runs portal Computer Use',
                        },
                        {
                          model: 'gemini-4-neon',
                          job: 'Looks up official university rules (Google Search + URL Context)',
                        },
                        {
                          model: 'gemini-4-carbon',
                          job: 'Writes plain-English fixes, risk briefs & stuck-portal escalation',
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
                          <span className="text-slate-800">{item.job}</span>
                          <code className="rounded-full bg-blue-50 px-3 py-0.5 font-mono text-[13px] font-semibold text-[#1D4ED8]">
                            {item.model}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {caseResult.usageSummary && (
                    <div className="grid gap-4 border-t border-slate-200 pt-5 text-[14px] sm:grid-cols-4">
                      <div>
                        <p className="text-slate-500">Case ID</p>
                        <p className="mt-0.5 font-mono font-semibold text-slate-900">
                          {caseResult.id}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Input tokens</p>
                        <p className="mt-0.5 font-mono font-semibold text-slate-900">
                          {caseResult.usageSummary.totalInputTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Output tokens</p>
                        <p className="mt-0.5 font-mono font-semibold text-slate-900">
                          {caseResult.usageSummary.totalOutputTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">AI cost per case</p>
                        <p className="mt-0.5 font-mono font-semibold text-emerald-700">
                          ${caseResult.usageSummary.estimatedUsd.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  )}

                  <UniversityRulesLookup />

                  <div className="border-t border-slate-200 pt-5">
                    <h3 className="font-display text-[15px] font-bold text-slate-950">
                      Extracted facts ({caseResult.facts.length})
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {caseResult.facts.map((fact, index) => (
                        <div
                          key={`${fact.field}-${index}`}
                          className="border-b border-slate-200 pb-3 text-[14px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-500">
                              {fact.field.replace(/_/g, ' ')}
                            </span>
                            <span className="text-slate-500">
                              {fact.sourceDocName} · p.{fact.page}
                            </span>
                          </div>
                          <p className="mt-0.5 font-semibold text-slate-900">{fact.value}</p>
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
          CONSENT + E-SIGNATURE MODAL (opens ONLY on "Upload Documents")
         ======================================================================= */}
      {consentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consent-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 id="consent-modal-title" className="font-display text-[22px] font-extrabold text-slate-950">
                  Before you upload your documents
                </h2>
                <p className="mt-1 text-[14px] text-slate-600">
                  Plain-English privacy promise for students and parents.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConsentModalOpen(false)}
                aria-label="Close modal"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>

            <form onSubmit={handleConsentSubmit} className="mt-5 space-y-4">
              <label className="flex cursor-pointer items-start gap-3 text-[15px] text-slate-800">
                <input
                  type="checkbox"
                  checked={acceptedStorageNotice}
                  onChange={(e) => setAcceptedStorageNotice(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>
                  <strong className="text-slate-950">What we save:</strong> Only the details needed
                  to prepare your application (names, dates, balances, and short quotes). Passport,
                  bank account, Aadhaar, and PAN numbers are shortened to the last 4 digits.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 text-[15px] text-slate-800">
                <input
                  type="checkbox"
                  checked={acceptedImmediateDeletion}
                  onChange={(e) => setAcceptedImmediateDeletion(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>
                  <strong className="text-slate-950">Files deleted right away:</strong> Your PDFs
                  and photos are read in memory and deleted immediately. We never store your
                  original files.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 text-[15px] text-slate-800">
                <input
                  type="checkbox"
                  checked={acceptedDeleteRight}
                  onChange={(e) => setAcceptedDeleteRight(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>
                  <strong className="text-slate-950">Delete anytime:</strong> You can permanently
                  delete your case and saved details with one click.
                </span>
              </label>

              <div className="border-t border-slate-200 pt-3">
                <label className="flex cursor-pointer items-start gap-3 text-[15px] text-slate-800">
                  <input
                    type="checkbox"
                    checked={isUnder18}
                    onChange={(e) => setIsUnder18(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <span>I am under 18 years old.</span>
                </label>

                {isUnder18 && (
                  <label className="mt-3 ml-8 flex cursor-pointer items-start gap-3 text-[15px] text-slate-800">
                    <input
                      type="checkbox"
                      checked={parentalConsentConfirmed}
                      onChange={(e) => setParentalConsentConfirmed(e.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <span>
                      My parent or guardian has read this and agrees to AIRA checking my documents.
                    </span>
                  </label>
                )}
              </div>

              <div className="border-t border-slate-200 pt-3">
                <label className="flex cursor-pointer items-start gap-3 text-[15px] text-slate-800">
                  <input
                    type="checkbox"
                    checked={authorisationAccepted}
                    onChange={(e) => setAuthorisationAccepted(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <span>
                    I allow AIRA to check my documents and prepare my university form using only my
                    own details. Nothing will be submitted until a human counselor approves, and I
                    will sign any official immigration forms myself.
                  </span>
                </label>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <label
                  htmlFor="typed-signature"
                  className="block text-[14px] font-semibold text-slate-900"
                >
                  Type your full name to sign
                </label>
                <input
                  id="typed-signature"
                  type="text"
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="e.g. Arun Reddy"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
                />
              </div>

              {consentError && (
                <p role="alert" className="text-[14px] font-semibold text-red-600">
                  {consentError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setConsentModalOpen(false)}
                  className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-5 text-[14px] font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-full bg-[#2563EB] px-6 text-[15px] font-semibold text-white hover:bg-[#1D4ED8]"
                >
                  Continue to upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-200/80 bg-white px-4 py-7 text-center text-[14px] font-medium text-slate-600 sm:px-6">
        Global dreams, zero guesswork. AI prepares every application; a human counselor approves
        every submit.
      </footer>
    </div>
  );
}
