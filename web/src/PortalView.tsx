import { useEffect, useState, type FormEvent } from 'react';
import TopNav from './TopNav.tsx';
import { formatRupees } from './formatInr.ts';

interface PortalViewProps {
  onNavigate: (route: 'student' | 'counselor' | 'portal') => void;
}

const PROGRAM_OPTIONS = [
  'MSc Computer Science',
  'MSc Data Science',
  'MSc Artificial Intelligence',
  'MBA International Management',
  'MS Electrical Engineering',
];

export default function PortalView({ onNavigate }: PortalViewProps) {
  const params = new URLSearchParams(window.location.search);
  const accountMode = params.get('mode') === 'account';
  const initialCaseId = params.get('caseId') || '';
  const initialApprovalToken = params.get('approvalToken') || '';
  const initialStep =
    params.get('step') === '7' || (initialCaseId && initialApprovalToken)
      ? 7
      : accountMode
        ? 1
        : 2;

  const [page, setPage] = useState<number>(initialStep);
  const [caseId, setCaseId] = useState(initialCaseId);
  const [approvalToken, setApprovalToken] = useState(initialApprovalToken);
  const [latestApprovedCaseId, setLatestApprovedCaseId] = useState('');

  // Account creation mode (only via ?mode=account)
  const [fullName, setFullName] = useState('Sample Applicant');
  const [email, setEmail] = useState('sample.applicant@aira-demo.example');
  const [phone, setPhone] = useState('+91 9876543210');
  const [password, setPassword] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [sessionId, setSessionId] = useState('sess_demo');

  // Step 1 (page 2): Personal Details
  const [dob, setDob] = useState('2002-04-15');
  const [nationality, setNationality] = useState('India');
  const [passportLast4, setPassportLast4] = useState('****9103');

  // Step 2 (page 3): Academics
  const [university, setUniversity] = useState('Jawaharlal Nehru Technological University');
  const [degree, setDegree] = useState('B.Tech Computer Science');
  const [cgpa, setCgpa] = useState('8.4');
  const [cgpaScale, setCgpaScale] = useState('10');
  const [backlogs, setBacklogs] = useState('0');
  const [graduationDate, setGraduationDate] = useState('2025-05-20');
  const [selectedProgram, setSelectedProgram] = useState('MSc Computer Science');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Step 3 (page 4): English
  const [englishTestType, setEnglishTestType] = useState('IELTS Academic');
  const [englishOverallScore, setEnglishOverallScore] = useState('7.0');
  const [englishWritingScore, setEnglishWritingScore] = useState('6.5');
  const [englishTestDate, setEnglishTestDate] = useState('2026-08-12');

  // Step 4 (page 5): Funding
  const [bankBalance, setBankBalance] = useState('2200000');
  const [currency, setCurrency] = useState('INR');
  const [loanAmount, setLoanAmount] = useState('1200000');
  const [sponsor, setSponsor] = useState('Self + Education Loan');

  // Step 5 (page 6): Documents
  const [docFileName, setDocFileName] = useState('SAMPLE_UK_OFFER_LETTER.pdf');
  const [declarationAccepted, setDeclarationAccepted] = useState(true);
  const [declarationName, setDeclarationName] = useState('Sample Applicant');

  // Feedback & Submit
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitReceipt, setSubmitReceipt] = useState<{
    submissionId: string;
    approvedBy: string;
    submittedAt: string;
  } | null>(null);

  useEffect(() => {
    if (!initialCaseId) return;
    fetch(`/api/cases/${encodeURIComponent(initialCaseId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return;
        if (c.studentName) {
          const name = String(c.studentName);
          setFullName(name);
          setDeclarationName(name);
        }
        if (c.studentEmail) setEmail(String(c.studentEmail));
        if (c.targetUniversity) setUniversity(String(c.targetUniversity));
        if (c.targetProgram) setSelectedProgram(String(c.targetProgram));
      })
      .catch(() => {});
  }, [initialCaseId]);

  useEffect(() => {
    if (page !== 7) return;
    let cancelled = false;
    fetch('/api/counselor/queue')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.resolved)) return;
        const approved = (
          data.resolved as Array<{
            id?: string;
            status?: string;
            approvedAt?: string;
            createdAt?: string;
          }>
        )
          .filter(
            (c) => c && c.status === 'approved' && typeof c.id === 'string' && c.id.length > 0
          )
          .sort((a, b) => {
            const ta = Date.parse(a.approvedAt || a.createdAt || '') || 0;
            const tb = Date.parse(b.approvedAt || b.createdAt || '') || 0;
            return tb - ta;
          });
        const latestId = approved[0]?.id || '';
        if (!latestId) return;
        setLatestApprovedCaseId(latestId);
        setCaseId((prev) => (prev.trim() ? prev : latestId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page]);

  const verticalSteps = [
    { pageNum: 2, num: 1, title: 'Personal', buttonLabel: '1. Personal' },
    { pageNum: 3, num: 2, title: 'Academics', buttonLabel: '2. Academics' },
    { pageNum: 4, num: 3, title: 'English', buttonLabel: '3. English' },
    { pageNum: 5, num: 4, title: 'Funding', buttonLabel: '4. Funding' },
    { pageNum: 6, num: 5, title: 'Documents', buttonLabel: '5. Documents' },
    { pageNum: 7, num: 6, title: 'Submit', buttonLabel: '6. Submit' },
  ];

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/portal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create portal account.');
      setAccountCreated(true);
      setInfoMsg(data.message);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Account creation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyEmail(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/portal/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode, caseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      setSessionId(data.sessionId);
      setPage(2);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not verify code.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftAndAdvance(nextPage: number) {
    setErrorMsg(null);
    setSubmitError(null);
    setBusy(true);
    try {
      const activeSession = sessionId || 'sess_demo';
      await fetch(`/api/portal/applications/${activeSession}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          caseId,
          personal: { fullName, dob, nationality, passportLast4, phone },
          academics: {
            university,
            degree,
            cgpa,
            cgpaScale,
            backlogs,
            graduationDate,
            selectedProgram,
          },
          funding: { bankBalance, currency, loanAmount, sponsor },
          documentFileName: docFileName,
          declarationAccepted,
          declarationName,
        }),
      });
      setPage(nextPage);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save draft.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalSubmit() {
    setErrorMsg(null);
    setSubmitError(null);
    setBusy(true);
    const trimmedToken = approvalToken.trim();
    const trimmedCaseId = caseId.trim();
    try {
      const activeSession = sessionId || 'sess_demo';
      const res = await fetch(`/api/portal/applications/${activeSession}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(trimmedToken ? { 'X-Approval-Token': trimmedToken } : {}),
        },
        body: JSON.stringify({
          caseId: trimmedCaseId,
          portalUrl: '/portal',
          approvalToken: trimmedToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 || !trimmedToken) {
          const detail = data?.error ? ` ${String(data.error)}` : '';
          setSubmitError(
            `403 — Counselor approval required. Approve this case in Step 2 (Approve), copy the approval code, and paste it above.${detail}`
          );
          return;
        }
        throw new Error(data?.error || `Submit blocked (HTTP ${res.status}).`);
      }
      setSubmitReceipt({
        submissionId: data.submissionId,
        approvedBy: data.approvedBy,
        submittedAt: data.submittedAt,
      });
    } catch (err) {
      if (!trimmedToken) {
        setSubmitError(
          '403 — Counselor approval required. Approve this case in Step 2 (Approve), copy the approval code, and paste it above.'
        );
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Submission blocked.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <TopNav
        activeRoute="portal"
        onNavigate={onNavigate}
        submitCompleted={Boolean(submitReceipt)}
      />

      {/* Institutional University System Header (deliberately neutral & distinct from Aira) */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3.5">
            <div
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-gray-300 bg-gray-50"
            >
              <svg
                viewBox="0 0 64 64"
                className="h-8 w-8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M32 6L52 14V30C52 44.5 43.2 53.8 32 58C20.8 53.8 12 44.5 12 30V14L32 6Z"
                  fill="#F9FAFB"
                  stroke="#111827"
                  strokeWidth="3"
                />
                <path d="M21 26L32 20L43 26L32 32L21 26Z" fill="#111827" />
                <path
                  d="M25 29V37C25 39.2 28.1 41 32 41C35.9 41 39 39.2 39 37V29"
                  stroke="#111827"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path d="M43 26V35" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-medium text-gray-600">
                University Admissions System
              </p>
              <h1 className="text-[24px] font-bold tracking-tight text-gray-900">
                Sample University: Postgraduate Application (demo)
              </h1>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[14px] font-medium text-gray-600">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">
              lock
            </span>
            <span>Submit unlocks with a one-time counselor approval</span>
          </span>
        </div>
      </div>

      {/* Main 2-column University Portal Body: Left vertical steps + Right 2-col form */}
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 sm:px-6">
        {infoMsg && (
          <div
            role="status"
            className="mb-4 rounded-[12px] border border-gray-200 bg-white p-4 text-[16px] text-gray-900"
          >
            {infoMsg}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mb-4 rounded-[12px] border border-[#F6AEA9] bg-[#FCE8E6] p-4 text-[16px] text-[#D93025]"
          >
            {errorMsg}
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[240px_1fr]">
          {/* Left: Vertical steps with ticks */}
          <aside className="rounded-[12px] border border-gray-200 bg-white p-3">
            <p className="px-3 py-2 text-[14px] font-bold text-gray-600">Application sections</p>
            <ol className="flex flex-wrap gap-1 lg:flex-col">
              {verticalSteps.map((s) => {
                const isCurrent = page === s.pageNum;
                const isDone = page > s.pageNum || Boolean(submitReceipt);
                return (
                  <li key={s.pageNum} className="lg:w-full">
                    <button
                      type="button"
                      aria-current={isCurrent ? 'step' : undefined}
                      onClick={() => {
                        setErrorMsg(null);
                        setSubmitError(null);
                        setPage(s.pageNum);
                      }}
                      className={`flex h-11 w-full items-center justify-between gap-2 rounded-[8px] px-3 text-left text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] ${
                        isCurrent
                          ? 'bg-[#1A73E8] text-white'
                          : isDone
                            ? 'text-gray-900 hover:bg-gray-50'
                            : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>{s.buttonLabel}</span>
                      {isDone && !isCurrent && (
                        <span
                          className="material-symbols-outlined !text-[18px] text-[#188038]"
                          aria-hidden="true"
                        >
                          check_circle
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          {/* Right: The form (2-column on desktop, labelled inputs) */}
          <div className="rounded-[12px] border border-gray-200 bg-white p-6">
            {/* ACCOUNT MODE PAGE 1 (only reachable via ?mode=account) */}
            {accountMode && page === 1 && (
              <section className="space-y-4">
                <h2 className="text-[24px] font-bold text-gray-900">Create Applicant Account</h2>
                {!accountCreated ? (
                  <form onSubmit={handleRegister} className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="p-name" className="block text-[14px] font-medium text-gray-900">
                        Full name
                      </label>
                      <input
                        id="p-name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="p-email" className="block text-[14px] font-medium text-gray-900">
                        Email address
                      </label>
                      <input
                        id="p-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="p-phone" className="block text-[14px] font-medium text-gray-900">
                        Phone number
                      </label>
                      <input
                        id="p-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="p-pass" className="block text-[14px] font-medium text-gray-900">
                        Portal password
                      </label>
                      <input
                        id="p-pass"
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex h-11 items-center rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                      >
                        {busy ? 'Creating...' : 'Create account'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyEmail} className="space-y-4">
                    <div>
                      <label htmlFor="p-code" className="block text-[14px] font-medium text-gray-900">
                        6-digit email code
                      </label>
                      <input
                        id="p-code"
                        type="text"
                        required
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 font-mono text-[16px]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex h-11 items-center rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                    >
                      Verify &amp; continue
                    </button>
                  </form>
                )}
              </section>
            )}

            {/* STEP 1 (page 2): PERSONAL DETAILS */}
            {page === 2 && (
              <section className="space-y-5">
                <div className="border-b border-gray-200 pb-3">
                  <h2 className="text-[24px] font-bold text-gray-900">Step 1: Personal Details</h2>
                  <p className="text-[14px] text-gray-600">
                    Matches the identity details on your passport.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="p2-name" className="block text-[14px] font-medium text-gray-900">
                      Full legal name
                    </label>
                    <input
                      id="p2-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p2-dob" className="block text-[14px] font-medium text-gray-900">
                      Date of birth
                    </label>
                    <input
                      id="p2-dob"
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p2-nat" className="block text-[14px] font-medium text-gray-900">
                      Country of nationality
                    </label>
                    <input
                      id="p2-nat"
                      type="text"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p2-pass4" className="block text-[14px] font-medium text-gray-900">
                      Passport number (last 4 digits)
                    </label>
                    <input
                      id="p2-pass4"
                      type="text"
                      value={passportLast4}
                      onChange={(e) => setPassportLast4(e.target.value)}
                      placeholder="e.g. ****9103"
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraftAndAdvance(3)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                  >
                    <span>Save &amp; continue</span>
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* STEP 2 (page 3): ACADEMICS */}
            {page === 3 && (
              <section className="space-y-5">
                <div className="border-b border-gray-200 pb-3">
                  <h2 className="text-[24px] font-bold text-gray-900">Step 2: Academics</h2>
                  <p className="text-[14px] text-gray-600">
                    Undergraduate degree and chosen postgraduate course.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="relative sm:col-span-2">
                    <span className="block text-[14px] font-medium text-gray-900">
                      Target degree course
                    </span>
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={dropdownOpen}
                      onClick={() => setDropdownOpen((o) => !o)}
                      className="mt-1 flex h-11 w-full items-center justify-between rounded-[8px] border border-gray-300 bg-white px-3 text-left text-[16px]"
                    >
                      <span>{selectedProgram || 'Select a course...'}</span>
                      <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                        expand_more
                      </span>
                    </button>
                    {dropdownOpen && (
                      <ul
                        role="listbox"
                        className="absolute z-20 mt-1 w-full rounded-[8px] border border-gray-200 bg-white py-1 shadow-lg"
                      >
                        {PROGRAM_OPTIONS.map((opt) => (
                          <li key={opt}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedProgram === opt}
                              onClick={() => {
                                setSelectedProgram(opt);
                                setDropdownOpen(false);
                              }}
                              className="block w-full px-3 py-2 text-left text-[16px] hover:bg-gray-50"
                            >
                              {opt}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <label htmlFor="p3-uni" className="block text-[14px] font-medium text-gray-900">
                      Undergraduate university
                    </label>
                    <input
                      id="p3-uni"
                      type="text"
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p3-deg" className="block text-[14px] font-medium text-gray-900">
                      Degree title
                    </label>
                    <input
                      id="p3-deg"
                      type="text"
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p3-cgpa" className="block text-[14px] font-medium text-gray-900">
                      CGPA / score
                    </label>
                    <input
                      id="p3-cgpa"
                      type="text"
                      value={cgpa}
                      onChange={(e) => setCgpa(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p3-scale" className="block text-[14px] font-medium text-gray-900">
                      Grading scale
                    </label>
                    <input
                      id="p3-scale"
                      type="text"
                      value={cgpaScale}
                      onChange={(e) => setCgpaScale(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p3-backlogs" className="block text-[14px] font-medium text-gray-900">
                      Active backlogs
                    </label>
                    <input
                      id="p3-backlogs"
                      type="number"
                      min="0"
                      value={backlogs}
                      onChange={(e) => setBacklogs(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p3-grad" className="block text-[14px] font-medium text-gray-900">
                      Graduation date
                    </label>
                    <input
                      id="p3-grad"
                      type="date"
                      value={graduationDate}
                      onChange={(e) => setGraduationDate(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraftAndAdvance(4)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                  >
                    <span>Save &amp; continue</span>
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* STEP 3 (page 4): ENGLISH */}
            {page === 4 && (
              <section className="space-y-5">
                <div className="border-b border-gray-200 pb-3">
                  <h2 className="text-[24px] font-bold text-gray-900">
                    Step 3: English Proficiency
                  </h2>
                  <p className="text-[14px] text-gray-600">
                    English language qualification details.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="p-eng-type" className="block text-[14px] font-medium text-gray-900">
                      Test type
                    </label>
                    <input
                      id="p-eng-type"
                      type="text"
                      value={englishTestType}
                      onChange={(e) => setEnglishTestType(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-eng-overall" className="block text-[14px] font-medium text-gray-900">
                      Overall band / score
                    </label>
                    <input
                      id="p-eng-overall"
                      type="text"
                      value={englishOverallScore}
                      onChange={(e) => setEnglishOverallScore(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-eng-writing" className="block text-[14px] font-medium text-gray-900">
                      Writing score
                    </label>
                    <input
                      id="p-eng-writing"
                      type="text"
                      value={englishWritingScore}
                      onChange={(e) => setEnglishWritingScore(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-eng-date" className="block text-[14px] font-medium text-gray-900">
                      Test date
                    </label>
                    <input
                      id="p-eng-date"
                      type="date"
                      value={englishTestDate}
                      onChange={(e) => setEnglishTestDate(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraftAndAdvance(5)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                  >
                    <span>Save &amp; continue</span>
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* STEP 4 (page 5): FUNDING */}
            {page === 5 && (
              <section className="space-y-5">
                <div className="border-b border-gray-200 pb-3">
                  <h2 className="text-[24px] font-bold text-gray-900">Step 4: Funding</h2>
                  <p className="text-[14px] text-gray-600">
                    Financial evidence for tuition and living costs.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="p4-bal" className="block text-[14px] font-medium text-gray-900">
                      Bank balance
                    </label>
                    <input
                      id="p4-bal"
                      type="text"
                      value={bankBalance}
                      onChange={(e) => setBankBalance(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p4-curr" className="block text-[14px] font-medium text-gray-900">
                      Currency
                    </label>
                    <input
                      id="p4-curr"
                      type="text"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p4-loan" className="block text-[14px] font-medium text-gray-900">
                      Education loan amount
                    </label>
                    <input
                      id="p4-loan"
                      type="text"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p4-spon" className="block text-[14px] font-medium text-gray-900">
                      Funding source
                    </label>
                    <input
                      id="p4-spon"
                      type="text"
                      value={sponsor}
                      onChange={(e) => setSponsor(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraftAndAdvance(6)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                  >
                    <span>Save &amp; continue</span>
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* STEP 5 (page 6): DOCUMENTS */}
            {page === 6 && (
              <section className="space-y-5">
                <div className="border-b border-gray-200 pb-3">
                  <h2 className="text-[24px] font-bold text-gray-900">Step 5: Documents</h2>
                  <p className="text-[14px] text-gray-600">
                    Supporting academic and financial documents.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="p5-file" className="block text-[14px] font-medium text-gray-900">
                      Attached document packet
                    </label>
                    <input
                      id="p5-file"
                      type="file"
                      onChange={(e) => setDocFileName(e.target.files?.[0]?.name || docFileName)}
                      className="mt-1 block w-full rounded-[8px] border border-gray-300 bg-gray-50 p-2.5 text-[14px]"
                    />
                    {docFileName && (
                      <p className="mt-1.5 text-[14px] text-[#188038]">
                        Current file: {docFileName}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="p6-sig" className="block text-[14px] font-medium text-gray-900">
                      Applicant declaration name
                    </label>
                    <input
                      id="p6-sig"
                      type="text"
                      value={declarationName}
                      onChange={(e) => setDeclarationName(e.target.value)}
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 text-[16px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraftAndAdvance(7)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[#1A73E8] px-5 text-[16px] font-semibold text-white hover:bg-[#1557B0]"
                  >
                    <span>Continue to Submit</span>
                    <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </section>
            )}

            {/* STEP 6 (page 7): SUBMIT */}
            {page === 7 && (
              <section className="space-y-5">
                <div className="border-b border-gray-200 pb-3">
                  <h2 className="text-[24px] font-bold text-gray-900">
                    Step 6: Final Review &amp; Submit
                  </h2>
                  <p className="text-[14px] text-gray-600">
                    Review your details and enter your counselor approval to submit.
                  </p>
                </div>

                {/* Lock banner */}
                <div className="flex items-center gap-3 rounded-[8px] border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] font-medium text-gray-900">
                  <span className="material-symbols-outlined text-[#1A73E8]" aria-hidden="true">
                    lock
                  </span>
                  <span>Submit unlocks with a one-time counselor approval</span>
                </div>

                {/* 2-column summary */}
                <dl className="grid gap-4 border-y border-gray-200 py-4 text-[14px] sm:grid-cols-2">
                  <div>
                    <dt className="text-gray-600">Applicant</dt>
                    <dd className="mt-0.5 text-[16px] font-semibold text-gray-900">
                      {fullName || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">Email</dt>
                    <dd className="mt-0.5 text-[16px] font-semibold text-gray-900">
                      {email || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">Course</dt>
                    <dd className="mt-0.5 text-[16px] font-semibold text-gray-900">
                      {selectedProgram || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">Undergraduate / CGPA</dt>
                    <dd className="mt-0.5 text-[16px] font-semibold text-gray-900">
                      {university || '—'} ({cgpa || '—'}/{cgpaScale})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">English score</dt>
                    <dd className="mt-0.5 text-[16px] font-semibold text-gray-900">
                      {englishTestType} {englishOverallScore}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600">Funding</dt>
                    <dd className="mt-0.5 text-[16px] font-semibold text-gray-900">
                      {currency.toUpperCase() === 'INR'
                        ? `${formatRupees(Number(bankBalance) || 0)} (Loan: ${formatRupees(Number(loanAmount) || 0)})`
                        : `${currency} ${bankBalance || '0'} (Loan: ${loanAmount || '0'})`}
                    </dd>
                  </div>
                </dl>

                {/* Approval inputs */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="p7-tok"
                      className="block text-[14px] font-semibold text-gray-900"
                    >
                      Counselor approval code
                    </label>
                    <input
                      id="p7-tok"
                      type="text"
                      value={approvalToken}
                      onChange={(e) => {
                        setApprovalToken(e.target.value);
                        setSubmitError(null);
                      }}
                      placeholder="Paste one-time counselor approval code"
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 font-mono text-[14px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="p7-case"
                      className="block text-[14px] font-semibold text-gray-900"
                    >
                      Application reference
                    </label>
                    <input
                      id="p7-case"
                      type="text"
                      value={caseId}
                      onChange={(e) => {
                        setCaseId(e.target.value);
                        setSubmitError(null);
                      }}
                      placeholder="case_..."
                      className="mt-1 h-11 w-full rounded-[8px] border border-gray-300 px-3 font-mono text-[14px] text-gray-900 focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/30"
                    />
                    {latestApprovedCaseId && caseId !== latestApprovedCaseId && (
                      <button
                        type="button"
                        onClick={() => {
                          setCaseId(latestApprovedCaseId);
                          setSubmitError(null);
                        }}
                        className="mt-1 text-left text-[14px] font-semibold text-[#1A73E8] underline"
                      >
                        Use latest approved case
                      </button>
                    )}
                  </div>
                </div>

                {submitReceipt ? (
                  <div
                    role="status"
                    className="rounded-[12px] border border-[#CEEAD6] bg-[#E6F4EA] p-6"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="material-symbols-outlined !text-[28px] text-[#188038]"
                        aria-hidden="true"
                      >
                        check_circle
                      </span>
                      <div className="space-y-1">
                        <h3 className="text-[24px] font-bold text-gray-900">
                          Application Submitted!
                        </h3>
                        <p className="text-[16px] text-gray-900">
                          Receipt ID:{' '}
                          <strong className="font-mono font-bold text-[#188038]">
                            {submitReceipt.submissionId}
                          </strong>
                        </p>
                        <p className="text-[14px] font-semibold text-gray-900">
                          Submitted only after counselor approval.
                        </p>
                        <p className="text-[14px] text-gray-600">
                          Approved by <strong>{submitReceipt.approvedBy}</strong> ·{' '}
                          {new Date(submitReceipt.submittedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {submitError && (
                      <div
                        role="alert"
                        className="flex items-start gap-2.5 rounded-[12px] border border-[#F6AEA9] bg-[#FCE8E6] p-4 text-[14px] font-semibold text-[#D93025]"
                      >
                        <span className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                          error
                        </span>
                        <p>{submitError}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleFinalSubmit()}
                        className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[#1A73E8] px-6 text-[16px] font-semibold text-white hover:bg-[#1557B0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] disabled:opacity-50"
                      >
                        <span>{busy ? 'Submitting...' : 'Submit Application'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-gray-200 bg-white px-4 py-6 text-center text-[14px] font-medium text-gray-600 sm:px-6">
        AI for speed. Code for money. Humans for the final yes.
      </footer>
    </div>
  );
}
