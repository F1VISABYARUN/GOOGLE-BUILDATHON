import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Info, Lock, ShieldAlert } from 'lucide-react';
import TopNav from './TopNav.tsx';

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
  const initialCaseId = params.get('caseId') || '';
  const initialApprovalToken = params.get('approvalToken') || '';
  const initialStep =
    params.get('step') === '7' || (initialCaseId && initialApprovalToken) ? 7 : 1;

  const [page, setPage] = useState<number>(initialStep);
  const [caseId, setCaseId] = useState(initialCaseId);
  const [approvalToken, setApprovalToken] = useState(initialApprovalToken);

  // Page 1: Account Creation + Email Verification
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accountCreated, setAccountCreated] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [sessionId, setSessionId] = useState('');

  // Page 2: Personal Details
  const [dob, setDob] = useState('');
  const [nationality, setNationality] = useState('India');
  const [passportLast4, setPassportLast4] = useState('');

  // Page 3: Academics (includes custom dropdown + date picker)
  const [university, setUniversity] = useState('');
  const [degree, setDegree] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [cgpaScale, setCgpaScale] = useState('10');
  const [backlogs, setBacklogs] = useState('0');
  const [graduationDate, setGraduationDate] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Page 4: Funding
  const [bankBalance, setBankBalance] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [loanAmount, setLoanAmount] = useState('');
  const [sponsor, setSponsor] = useState('');

  // Page 5: Document Upload
  const [docFileName, setDocFileName] = useState('');

  // Page 6: Declaration
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [declarationName, setDeclarationName] = useState('');

  // Feedback & Submit
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
        if (c.studentName && !fullName) setFullName(String(c.studentName));
        if (c.studentEmail && !email) setEmail(String(c.studentEmail));
        if (c.targetUniversity && !university) setUniversity(String(c.targetUniversity));
        if (c.targetProgram && !selectedProgram) setSelectedProgram(String(c.targetProgram));
      })
      .catch(() => {
        // ignore prefill lookup errors
      });
  }, [initialCaseId]);

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
    setBusy(true);
    try {
      const activeSession = sessionId || 'sess_draft_preview';
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
    setBusy(true);
    try {
      const activeSession = sessionId || 'sess_direct';
      const res = await fetch(`/api/portal/applications/${activeSession}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(approvalToken ? { 'X-Approval-Token': approvalToken } : {}),
        },
        body: JSON.stringify({
          caseId,
          portalUrl: '/portal',
          approvalToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Submit blocked (HTTP ${res.status}).`);
      }
      setSubmitReceipt({
        submissionId: data.submissionId,
        approvedBy: data.approvedBy,
        submittedAt: data.submittedAt,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Submission blocked.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <TopNav activeRoute="portal" onNavigate={onNavigate} />
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
        <span className="inline-flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
          Demo mode: sample data only
        </span>
      </div>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-950 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src="/assets/university-crest.jpg"
                alt="Direct University Admissions Crest"
                className="h-16 w-16 rounded-2xl border border-amber-400/40 object-cover shadow-md"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
                  Direct University Admissions Portal
                </p>
                <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
                  Postgraduate Direct Application
                </h1>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/40 bg-indigo-900/70 px-3 py-1 text-xs font-semibold text-indigo-100">
              <Lock className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              403 Submit Gate Active
            </span>
          </div>

          <ol className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            {[
              '1. Account',
              '2. Personal',
              '3. Academics',
              '4. Funding',
              '5. Documents',
              '6. Declaration',
              '7. Submit',
            ].map((label, idx) => (
              <li
                key={label}
                className={`rounded-full px-3.5 py-1.5 ${
                  page === idx + 1
                    ? 'bg-white text-indigo-950 shadow-sm'
                    : page > idx + 1
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-900/80 text-indigo-200'
                }`}
              >
                {label}
              </li>
            ))}
          </ol>
        </header>

        {infoMsg && (
          <div role="status" className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-base text-blue-950">
            {infoMsg}
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-base font-medium text-red-950">
            {errorMsg}
          </div>
        )}

        {/* PAGE 1: ACCOUNT CREATION + EMAIL VERIFICATION */}
        {page === 1 && (
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Page 1: Create Applicant Account</h2>
            {!accountCreated ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="p-name" className="block text-sm font-semibold">Full Legal Name</label>
                  <input
                    id="p-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Arun Reddy"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="p-email" className="block text-sm font-semibold">Student Email Address</label>
                  <input
                    id="p-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="p-phone" className="block text-sm font-semibold">Phone Number</label>
                  <input
                    id="p-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="p-pass" className="block text-sm font-semibold">Create Portal Password</label>
                  <input
                    id="p-pass"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-indigo-700 px-6 py-3.5 text-base font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                >
                  {busy ? 'Creating Account...' : 'Create Account & Send Verification Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmail} className="space-y-4">
                <p className="text-base text-slate-700">
                  Enter the 6-digit email verification code sent to <strong>{email}</strong>.
                </p>
                <div>
                  <label htmlFor="p-code" className="block text-sm font-semibold">
                    Email Verification Code
                  </label>
                  <input
                    id="p-code"
                    type="text"
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="6-digit code"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-indigo-700 px-6 py-3.5 text-base font-semibold text-white hover:bg-indigo-800"
                >
                  {busy ? 'Verifying...' : 'Verify Email & Continue'}
                </button>
              </form>
            )}
          </section>
        )}

        {/* PAGE 2: PERSONAL DETAILS */}
        {page === 2 && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Page 2: Personal Details</h2>
            <div>
              <label htmlFor="p2-name" className="block text-sm font-semibold">Full Legal Name</label>
              <input
                id="p2-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p2-dob" className="block text-sm font-semibold">Date of Birth</label>
                <input
                  id="p2-dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
              <div>
                <label htmlFor="p2-nat" className="block text-sm font-semibold">Nationality</label>
                <input
                  id="p2-nat"
                  type="text"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
            </div>
            <div>
              <label htmlFor="p2-pass4" className="block text-sm font-semibold">Passport Reference (Last 4 Digits)</label>
              <input
                id="p2-pass4"
                type="text"
                value={passportLast4}
                onChange={(e) => setPassportLast4(e.target.value)}
                placeholder="e.g. ****9103"
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraftAndAdvance(3)}
              className="rounded-xl bg-indigo-700 px-6 py-3.5 text-base font-semibold text-white hover:bg-indigo-800"
            >
              Save &amp; Continue to Academics
            </button>
          </section>
        )}

        {/* PAGE 3: ACADEMICS (WITH CUSTOM DROPDOWN & DATE PICKER) */}
        {page === 3 && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Page 3: Academic History</h2>

            {/* Custom ARIA Dropdown (non-native select to test computer-use agent clicks) */}
            <div className="relative">
              <span className="block text-sm font-semibold">Target Degree Programme (Custom Dropdown)</span>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((o) => !o)}
                className="mt-1 flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-base"
              >
                <span>{selectedProgram || 'Select a programme...'}</span>
                <span aria-hidden="true">▾</span>
              </button>
              {dropdownOpen && (
                <ul
                  role="listbox"
                  className="absolute z-20 mt-1 w-full rounded-xl border border-slate-300 bg-white py-1 shadow-lg"
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
                        className="block w-full px-4 py-2.5 text-left text-base hover:bg-indigo-50"
                      >
                        {opt}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p3-uni" className="block text-sm font-semibold">Undergraduate University</label>
                <input
                  id="p3-uni"
                  type="text"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
              <div>
                <label htmlFor="p3-deg" className="block text-sm font-semibold">Degree Title</label>
                <input
                  id="p3-deg"
                  type="text"
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="p3-cgpa" className="block text-sm font-semibold">CGPA / Score</label>
                <input
                  id="p3-cgpa"
                  type="text"
                  value={cgpa}
                  onChange={(e) => setCgpa(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
              <div>
                <label htmlFor="p3-scale" className="block text-sm font-semibold">Grading Scale</label>
                <input
                  id="p3-scale"
                  type="text"
                  value={cgpaScale}
                  onChange={(e) => setCgpaScale(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
              <div>
                <label htmlFor="p3-backlogs" className="block text-sm font-semibold">Total Backlogs</label>
                <input
                  id="p3-backlogs"
                  type="number"
                  min="0"
                  value={backlogs}
                  onChange={(e) => setBacklogs(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
            </div>

            <div>
              <label htmlFor="p3-grad" className="block text-sm font-semibold">Graduation Date (Date Picker)</label>
              <input
                id="p3-grad"
                type="date"
                value={graduationDate}
                onChange={(e) => setGraduationDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraftAndAdvance(4)}
              className="rounded-xl bg-indigo-700 px-6 py-3.5 text-base font-semibold text-white hover:bg-indigo-800"
            >
              Save &amp; Continue to Funding
            </button>
          </section>
        )}

        {/* PAGE 4: FUNDING */}
        {page === 4 && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Page 4: Funding &amp; Financial Proof</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p4-bal" className="block text-sm font-semibold">Bank Balance</label>
                <input
                  id="p4-bal"
                  type="text"
                  value={bankBalance}
                  onChange={(e) => setBankBalance(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
              <div>
                <label htmlFor="p4-curr" className="block text-sm font-semibold">Currency</label>
                <input
                  id="p4-curr"
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p4-loan" className="block text-sm font-semibold">Education Loan Amount</label>
                <input
                  id="p4-loan"
                  type="text"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
              <div>
                <label htmlFor="p4-spon" className="block text-sm font-semibold">Sponsor Name</label>
                <input
                  id="p4-spon"
                  type="text"
                  value={sponsor}
                  onChange={(e) => setSponsor(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraftAndAdvance(5)}
              className="rounded-xl bg-indigo-700 px-6 py-3.5 text-base font-semibold text-white hover:bg-indigo-800"
            >
              Save &amp; Continue to Document Upload
            </button>
          </section>
        )}

        {/* PAGE 5: DOCUMENT UPLOAD */}
        {page === 5 && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Page 5: Supporting Documents</h2>
            <div>
              <label htmlFor="p5-file" className="block text-sm font-semibold">
                Upload verified transcript / financial packet (optional for draft test)
              </label>
              <input
                id="p5-file"
                type="file"
                onChange={(e) => setDocFileName(e.target.files?.[0]?.name || '')}
                className="mt-2 block w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-base"
              />
              {docFileName && (
                <p className="mt-2 text-sm text-emerald-800">Attached: {docFileName}</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraftAndAdvance(6)}
              className="rounded-xl bg-indigo-700 px-6 py-3.5 text-base font-semibold text-white hover:bg-indigo-800"
            >
              Save &amp; Continue to Declaration
            </button>
          </section>
        )}

        {/* PAGE 6: DECLARATION */}
        {page === 6 && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Page 6: Applicant Declaration</h2>
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-base text-amber-950">
              High-stakes gate: Confirming a legal declaration and submitting an application requires
              a valid single-use counselor approval token.
            </p>
            <label className="flex items-start gap-3 text-base">
              <input
                type="checkbox"
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-400"
              />
              <span>
                I declare that all academic and financial details entered in this application match
                the original verified documents.
              </span>
            </label>
            <div>
              <label htmlFor="p6-sig" className="block text-sm font-semibold">Applicant Name</label>
              <input
                id="p6-sig"
                type="text"
                value={declarationName}
                onChange={(e) => setDeclarationName(e.target.value)}
                placeholder={fullName || 'Type full name'}
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraftAndAdvance(7)}
              className="rounded-xl bg-indigo-700 px-6 py-3.5 text-base font-semibold text-white hover:bg-indigo-800"
            >
              Continue to Final Review
            </button>
          </section>
        )}

        {/* PAGE 7: REVIEW & SUBMIT GATE */}
        {page === 7 && (
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">Page 7: Final Review &amp; Submit</h2>

            <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-base sm:grid-cols-2">
              <div><dt className="text-xs uppercase text-slate-500">Applicant</dt><dd className="font-semibold">{fullName || '—'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Email</dt><dd className="font-semibold">{email || '—'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Programme</dt><dd className="font-semibold">{selectedProgram || '—'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">University / CGPA</dt><dd className="font-semibold">{university || '—'} ({cgpa || '—'}/{cgpaScale})</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Graduation Date</dt><dd className="font-semibold">{graduationDate || '—'}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Funding</dt><dd className="font-semibold">{currency} {bankBalance || '0'} (Loan: {loanAmount || '0'})</dd></div>
            </dl>

            <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
              <div>
                <label htmlFor="p7-case" className="block text-sm font-semibold">Aira Case ID</label>
                <input
                  id="p7-case"
                  type="text"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  placeholder="case_..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="p7-tok" className="block text-sm font-semibold">
                  Counselor Single-Use Approval Token
                </label>
                <input
                  id="p7-tok"
                  type="text"
                  value={approvalToken}
                  onChange={(e) => setApprovalToken(e.target.value)}
                  placeholder="Empty -> Submit returns HTTP 403"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>

            {submitReceipt ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5 text-emerald-950"
              >
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <p className="text-xl font-bold">Application Submitted!</p>
                  <p className="mt-1 font-mono text-base">
                    Reference ID: <strong>{submitReceipt.submissionId}</strong>
                  </p>
                  <p className="mt-1 text-sm">
                    Approved by counselor <strong>{submitReceipt.approvedBy}</strong> · Submitted at{' '}
                    {new Date(submitReceipt.submittedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {!approvalToken && (
                  <p className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    No counselor token entered — clicking Submit will return HTTP 403 Blocked.
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleFinalSubmit()}
                  className="rounded-xl bg-emerald-700 px-6 py-4 text-lg font-bold text-white shadow-md hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busy ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
