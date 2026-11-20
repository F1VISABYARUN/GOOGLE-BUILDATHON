import { useEffect, useState, type FormEvent } from 'react';

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
  destinationCountry: string;
  ukRegion?: 'london' | 'outside_london';
  storageBackend: 'firestore' | 'memory_fallback';
  documents: Array<{ fileName: string; mimeType: string; documentType: string }>;
  facts: VerifiedFact[];
  flags: CheckFlag[];
  statusTimeline: StatusStep[];
}

function severityStyles(severity: 'red' | 'amber' | 'green') {
  if (severity === 'red') {
    return {
      card: 'border-red-300 bg-red-50',
      badge: 'bg-red-700 text-white',
      label: 'RED FLAG',
    };
  }
  if (severity === 'amber') {
    return {
      card: 'border-amber-300 bg-amber-50',
      badge: 'bg-amber-700 text-white',
      label: 'AMBER — REVIEW',
    };
  }
  return {
    card: 'border-emerald-300 bg-emerald-50',
    badge: 'bg-emerald-700 text-white',
    label: 'GREEN — PASSED',
  };
}

export default function App() {
  // Phase 2 Step state: 'consent' -> 'upload' -> 'results'
  const [step, setStep] = useState<'consent' | 'upload' | 'results'>('consent');

  // Consent & one-time authorisation state
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

  // Dated, visible, editable exchange rates (never hard-coded in checks)
  const [rateDate, setRateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rateGbp, setRateGbp] = useState('120');
  const [rateUsd, setRateUsd] = useState('96');
  const [rateEur, setRateEur] = useState('102');
  const [rateCad, setRateCad] = useState('68');
  const [rateAud, setRateAud] = useState('62');

  const [ukRules, setUkRules] = useState<UkRules | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [caseResult, setCaseResult] = useState<CaseRecord | null>(null);

  // Phase 1 Gemini system status
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [helloReply, setHelloReply] = useState<HelloResponse | null>(null);
  const [helloLoading, setHelloLoading] = useState(false);
  const [helloError, setHelloError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/rules/uk')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setUkRules(data as UkRules);
      })
      .catch(() => {});

    fetch('/api/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models) setModels(data.models as string[]);
      })
      .catch(() => {});
  }, []);

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
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              Aira Application Agent
            </p>
            <nav aria-label="Progress steps" className="flex gap-2 text-sm font-medium">
              <span
                className={`rounded-full px-3 py-1 ${
                  step === 'consent' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                1. Consent
              </span>
              <span
                className={`rounded-full px-3 py-1 ${
                  step === 'upload' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                2. Upload
              </span>
              <span
                className={`rounded-full px-3 py-1 ${
                  step === 'results' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                3. Results
              </span>
            </nav>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Document Check &amp; Verification
          </h1>
          <p className="mt-2 text-lg text-slate-700">
            Upload your marksheets, passport, bank or loan letters, and offer letter. Every fact is
            backed by an exact quote, and every money or date rule is checked in plain code.
          </p>
        </header>

        {/* STEP 1: CONSENT & AUTHORISATION */}
        {step === 'consent' && (
          <form
            onSubmit={handleConsentSubmit}
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-2xl font-semibold text-slate-950">
              Step 1: Privacy Consent &amp; One-Time Authorisation
            </h2>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-base text-slate-800">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acceptedStorageNotice}
                  onChange={(e) => setAcceptedStorageNotice(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span>
                  <strong>What we store:</strong> We store only the extracted facts, their exact
                  document quotes, check flags, and your consent record. Passport and bank account
                  numbers are masked to the last 4 digits.
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acceptedImmediateDeletion}
                  onChange={(e) => setAcceptedImmediateDeletion(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span>
                  <strong>Immediate file deletion:</strong> Your uploaded PDF and image files are
                  read in memory only and deleted immediately after reading. We never save your
                  document files to disk or cloud storage.
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acceptedDeleteRight}
                  onChange={(e) => setAcceptedDeleteRight(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span>
                  <strong>Delete my data (DPDP Act):</strong> You can delete your entire case,
                  extracted facts, and consent record at any time using the Delete My Data button.
                </span>
              </label>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-base text-slate-800">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isUnder18}
                  onChange={(e) => setIsUnder18(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span>I am under 18 years old.</span>
              </label>

              {isUnder18 && (
                <label className="ml-8 flex items-start gap-3 text-slate-900">
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

            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-base text-slate-900">
              <p className="font-semibold text-blue-950">One-Time Student Authorisation</p>
              <p className="leading-relaxed">
                I authorise Aira Application Agent to extract facts from my documents, create
                application accounts on direct university portals (never Common App or UCAS), and
                prepare my applications using only my own verified facts. No application will be
                submitted until a human counselor approves it, and I will sign any visa forms (such
                as the US DS-160) myself.
              </p>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={authorisationAccepted}
                  onChange={(e) => setAuthorisationAccepted(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                />
                <span className="font-medium">I agree to this one-time authorisation.</span>
              </label>
            </div>

            <div>
              <label htmlFor="typed-signature" className="block text-base font-semibold text-slate-900">
                Type your full legal name as your e-signature
              </label>
              <input
                id="typed-signature"
                type="text"
                value={typedSignature}
                onChange={(e) => setTypedSignature(e.target.value)}
                placeholder="e.g. Arun Reddy"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>

            {consentError && (
              <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">
                {consentError}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 sm:w-auto"
            >
              Sign &amp; Continue to Upload
            </button>
          </form>
        )}

        {/* STEP 2: UPLOAD & CHECK SETTINGS */}
        {step === 'upload' && (
          <form
            onSubmit={handleAnalyzeSubmit}
            className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-semibold text-slate-950">
                Step 2: Upload Documents
              </h2>
              <button
                type="button"
                onClick={() => setStep('consent')}
                className="text-base font-medium text-blue-700 underline hover:text-blue-900"
              >
                Edit consent
              </button>
            </div>

            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-950">
              Signed by <strong>{typedSignature}</strong> at{' '}
              {new Date(signedAt).toLocaleString()}. Files stay in memory only and are deleted
              right after reading.
            </p>

            <div>
              <label htmlFor="doc-upload" className="block text-base font-semibold text-slate-900">
                Choose up to 5 files (PDF, JPG, or PNG — max 10 MB each)
              </label>
              <input
                id="doc-upload"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => handleFileChange(e.target.files)}
                className="mt-2 block w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-base text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:text-base file:font-semibold file:text-white hover:file:bg-blue-800"
              />
              {files.length > 0 && (
                <ul className="mt-3 space-y-1 text-base text-slate-700">
                  {files.map((f) => (
                    <li key={f.name} className="rounded-lg bg-slate-100 px-3 py-2">
                      {f.name} ({(f.size / 1024).toFixed(0)} KB)
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="country" className="block text-base font-semibold text-slate-900">
                  Destination country
                </label>
                <select
                  id="country"
                  value={destinationCountry}
                  onChange={(e) =>
                    setDestinationCountry(e.target.value as typeof destinationCountry)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950"
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
                  <label htmlFor="uk-region" className="block text-base font-semibold text-slate-900">
                    UK study location
                  </label>
                  <select
                    id="uk-region"
                    value={ukRegion}
                    onChange={(e) => setUkRegion(e.target.value as 'london' | 'outside_london')}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950"
                  >
                    <option value="london">London (GBP 1,570 / month)</option>
                    <option value="outside_london">Outside London (GBP 1,203 / month)</option>
                  </select>
                </div>
              )}
            </div>

            {destinationCountry === 'UK' && ukRules && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p>
                  <strong>UK rule source</strong> (effective {ukRules.asOf}):{' '}
                  <a
                    href={ukRules.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    gov.uk/student-visa/money
                  </a>
                  {' · '}
                  {ukRules.bankStatement.minConsecutiveDaysHeld}-day holding rule &amp;{' '}
                  {ukRules.bankStatement.maxAgeDays}-day statement freshness window.
                </p>
              </div>
            )}

            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-2 text-base font-semibold text-slate-900">
                Optional: Required university cost (if not on an uploaded offer letter)
              </legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="req-cost" className="block text-sm font-medium text-slate-700">
                    Total required amount
                  </label>
                  <input
                    id="req-cost"
                    type="number"
                    min="0"
                    value={requiredCostAmount}
                    onChange={(e) => setRequiredCostAmount(e.target.value)}
                    placeholder="Leave blank to use offer / UK rule"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="req-curr" className="block text-sm font-medium text-slate-700">
                    Currency
                  </label>
                  <select
                    id="req-curr"
                    value={requiredCostCurrency}
                    onChange={(e) => setRequiredCostCurrency(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
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

            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-2 text-base font-semibold text-slate-900">
                Visible, Dated Exchange Rates (INR per 1 unit — editable)
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="rate-date" className="block text-sm font-medium text-slate-700">
                    As-of date
                  </label>
                  <input
                    id="rate-date"
                    type="date"
                    value={rateDate}
                    onChange={(e) => setRateDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="rate-gbp" className="block text-sm font-medium text-slate-700">
                    1 GBP in INR
                  </label>
                  <input
                    id="rate-gbp"
                    type="number"
                    step="0.01"
                    value={rateGbp}
                    onChange={(e) => setRateGbp(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="rate-usd" className="block text-sm font-medium text-slate-700">
                    1 USD in INR
                  </label>
                  <input
                    id="rate-usd"
                    type="number"
                    step="0.01"
                    value={rateUsd}
                    onChange={(e) => setRateUsd(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="rate-eur" className="block text-sm font-medium text-slate-700">
                    1 EUR in INR
                  </label>
                  <input
                    id="rate-eur"
                    type="number"
                    step="0.01"
                    value={rateEur}
                    onChange={(e) => setRateEur(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="rate-cad" className="block text-sm font-medium text-slate-700">
                    1 CAD in INR
                  </label>
                  <input
                    id="rate-cad"
                    type="number"
                    step="0.01"
                    value={rateCad}
                    onChange={(e) => setRateCad(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="rate-aud" className="block text-sm font-medium text-slate-700">
                    1 AUD in INR
                  </label>
                  <input
                    id="rate-aud"
                    type="number"
                    step="0.01"
                    value={rateAud}
                    onChange={(e) => setRateAud(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>
              </div>
            </fieldset>

            {analyzeError && (
              <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">
                <p className="font-semibold">Could not check documents</p>
                <p className="mt-1">{analyzeError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={analyzing}
              className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
            >
              {analyzing ? 'Reading documents & running checks...' : 'Extract Facts & Run Checks'}
            </button>
          </form>
        )}

        {/* STEP 3: STUDENT RESULTS PAGE */}
        {step === 'results' && caseResult && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    Case ID: <span className="font-mono">{caseResult.id}</span> · Stored in{' '}
                    {caseResult.storageBackend === 'firestore' ? 'Google Firestore' : 'local memory'}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">Status Timeline</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setCaseResult(null);
                    setStep('upload');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-900 hover:bg-slate-100"
                >
                  Check another set of documents
                </button>
              </div>

              <ol className="mt-4 space-y-3">
                {caseResult.statusTimeline.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-base">
                    <span
                      className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        item.status === 'done'
                          ? 'bg-emerald-700 text-white'
                          : item.status === 'current'
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.status === 'done' ? '✓' : idx + 1}
                    </span>
                    <div>
                      <p className="font-medium text-slate-950">{item.step}</p>
                      {item.at && (
                        <p className="text-sm text-slate-600">
                          {new Date(item.at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* FLAGS WITH PLAIN-ENGLISH FIXES */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-950">Checks &amp; Flags</h2>
              <p className="mt-1 text-base text-slate-700">
                All rules and money math were computed in plain code. Explanations were written in
                plain words for you.
              </p>

              <div className="mt-4 space-y-4">
                {caseResult.flags.map((flag) => {
                  const style = severityStyles(flag.severity);
                  return (
                    <article
                      key={flag.id}
                      className={`rounded-xl border p-5 ${style.card}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${style.badge}`}>
                          {style.label}
                        </span>
                        <h3 className="text-lg font-semibold text-slate-950">{flag.title}</h3>
                      </div>

                      <p className="mt-2 text-base text-slate-900">
                        {flag.explanation || flag.summary}
                      </p>

                      {flag.suggestedFix && (
                        <p className="mt-2 text-base font-medium text-slate-900">
                          <strong>Suggested fix:</strong> {flag.suggestedFix}
                        </p>
                      )}

                      {flag.mathLines && flag.mathLines.length > 0 && (
                        <div className="mt-3 rounded-lg border border-slate-300 bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                            Funds Math (Plain Code)
                          </p>
                          <ul className="mt-1.5 space-y-1 font-mono text-sm text-slate-900">
                            {flag.mathLines.map((line, idx) => (
                              <li key={idx}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {flag.quote && (
                        <blockquote className="mt-3 rounded-lg border border-slate-300 bg-white/80 px-3 py-2 font-mono text-sm text-slate-800">
                          Quote: {flag.quote}
                        </blockquote>
                      )}

                      {flag.sourceUrl && (
                        <p className="mt-2 text-sm text-slate-700">
                          Rule source (as of {flag.ruleAsOf}):{' '}
                          <a
                            href={flag.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-800 underline"
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

            {/* EXTRACTED FACTS WITH QUOTES */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-950">
                Extracted Facts &amp; Verbatim Quotes
              </h2>
              <p className="mt-1 text-base text-slate-700">
                Documents read:{' '}
                {caseResult.documents.map((d) => `${d.fileName} (${d.documentType})`).join(', ')}.
              </p>

              <div className="mt-4 space-y-3">
                {caseResult.facts.map((fact, index) => (
                  <div
                    key={`${fact.field}-${index}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-lg font-semibold text-slate-950">
                        <span className="font-mono text-sm uppercase text-slate-600">
                          {fact.field.replace(/_/g, ' ')}:
                        </span>{' '}
                        {fact.value}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          fact.needsReview
                            ? 'bg-amber-200 text-amber-950'
                            : 'bg-emerald-200 text-emerald-950'
                        }`}
                      >
                        {fact.needsReview ? 'Needs review' : 'Quote verified'}
                      </span>
                    </div>
                    <p className="mt-2 rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-800">
                      &ldquo;{fact.quote}&rdquo;
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Source: {fact.sourceDocName} (page {fact.page})
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* COLLAPSIBLE PHASE 1 GEMINI CONNECTION CHECK */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setShowSystemCheck((v) => !v)}
            className="flex w-full items-center justify-between text-left text-base font-semibold text-slate-900"
          >
            <span>Gemini API Status &amp; Available Models ({models.length})</span>
            <span className="text-blue-700">{showSystemCheck ? 'Hide' : 'Show'}</span>
          </button>

          {showSystemCheck && (
            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={handleSayHello}
                disabled={helloLoading}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {helloLoading ? 'Asking Gemini...' : 'Test /api/hello'}
              </button>

              {helloError && (
                <p role="alert" className="text-base text-red-800">
                  {helloError}
                </p>
              )}

              {helloReply && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-base text-emerald-950">
                  <p>{helloReply.text}</p>
                  <p className="mt-1 text-sm">
                    Model: {helloReply.model} · {helloReply.latencyMs} ms
                  </p>
                </div>
              )}

              {models.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {models.map((m) => (
                    <li
                      key={m}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
