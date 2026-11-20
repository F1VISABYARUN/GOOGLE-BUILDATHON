# Aira Application Agent — Pitch Deck Content
**Google Startup Buildathon India 2026 — Hyderabad**

> Note: Every figure below comes strictly from our research notes in `BUILD_PLAN.md` and live production tests on Google Cloud Run (`asia-south1`). Never claim "zero hallucination" — state our real guarantee: plain code does all money math & checks, every fact requires a verbatim quote from the document, and anything else is marked **"needs review"**.

---

## Slide 1 — Title
- **Product:** Aira Application Agent
- **Tagline:** AI does the forms. Plain code checks the math. A human counselor approves the exceptions.
- **Live App:** https://aira-web-217073132830.asia-south1.run.app
- **Event:** Google Startup Buildathon India 2026, Hyderabad (Nov 2026)

---

## Slide 2 — The Student's Problem (India → Abroad)
- Indian students apply to **8–12 programs**, paying roughly **$85 per application** (about **₹1.2–2 lakh** total across fees, tests, WES, and score reports).
- One small paperwork mistake sinks the entire round: a name mismatch across passport and marksheets, a funds gap, an outdated bank statement, or the wrong transcript sent to WES.
- **Refusals are surging:**
  - **Canada:** 74% Indian study permit refusal rate (Aug 2025)
  - **US:** ~61% Indian F-1 refusal rate in FY25 (Shorelight analysis of State Dept data)
  - **Australia:** 48.6% Indian student visa refusals (2026–27 YTD)
  - **UK:** 9.1% refusals in latest quarter, plus UK maintenance rises from **30 Nov 2026** to **£1,570/mo (London)** and **£1,203/mo (elsewhere)**
- **Financial pressure & broken intermediaries:** INR hit ~**96.96/$** (May 2026); education loans reached a 10-year high of **₹8.58 lakh crore** (FY26). Unregulated consultants charge students **₹30k–1.5 lakh** *and* take **10–25%** college commissions — with widespread document fraud cases.

---

## Slide 3 — The University's Problem (B2B Urgency)
- Since **1 June 2026**, UK universities must keep visa refusals **under 5%**, enrolment **≥95%**, and completion **≥85%** — or lose their sponsor licence.
  - Bloomsbury Institute lost its licence (Aug 2026).
  - Bucks New University was suspended (Sep 2026).
- Enrolling one international student costs ~**£4,051** (~16 applications per enrolment); US agent commissions run **$2,000–3,500** per student.
- Real market demand: **University of Salford** has an open tender for a credibility-check tool (**~£250k**, closing 30 Jan 2027).

---

## Slide 4 — Solution: Aira Application Agent (End-to-End Flow)
1. **DPDP Consent & One-Time Authorisation:** Student reviews privacy notice (in-memory reading only, no Cloud Storage, under-18 parental consent toggle) and e-signs one-time authorisation.
2. **Multimodal Extraction with Verbatim Quotes (`gemini-4-hydrogen`):** Extracts structured facts from Indian marksheets, CAS/offers, passports, and bank/loan letters.
3. **Plain-Code Verification (Never LLM Math):** TypeScript code checks every quote verbatim in the document text (unfound quotes → **"needs review"**), masks Passport, Account, Aadhaar, and PAN numbers in facts and quotes, and computes exact funds (`unpaid CAS tuition + 9 months UK living`), name consistency, GPA/backlogs, and 28-day bank rules.
4. **Computer-Use Agent (`aira-agent`):** Isolated Cloud Run Playwright worker creates the university portal account, reads email OTPs via `gemini-3.8-flash`, and fills all form pages using the **Gemini Interactions API**.
5. **Exception-Only Counselor Queue (`/counselor`):** Clean green cases clear in 1 click via **Batch Approve** (never auto-issued a token); only high-stakes exceptions go one-per-screen to a human counselor with `A`/`E`/`R`/`J`/`K` shortcuts.
6. **Hard Submit Gate (HTTP 403):** Both the agent's plain-code action filter and `/portal`'s Submit endpoint block submission until a counselor issues a single-use approval token in Firestore.

---

## Slide 5 — Why a Human Approves (Not Decoration — Reliability)
- On short tasks, AI computer-use agents beat humans (~90% vs 72% on OSWorld-Verified).
- On **300+ step workflows** like a real university application (custom dropdowns, date pickers, OTPs, session timeouts, file uploads), autonomous success drops to ~**45%**.
- **Our architecture turns that into an advantage:**
  - AI handles 100% of repetitive data entry and document auditing.
  - Plain code routes **only exceptions** (7 deterministic triggers) to `/counselor`.
  - One counselor clears **hundreds of cases a day** instead of ~20, while guaranteeing every submission has a verified human approval token and audit trail.

---

## Slide 6 — Google AI & Cloud Architecture Depth
- **4 Gemini Models Working Together:**
  - `gemini-4-hydrogen` (fallback `gemini-3.8-flash`): Zod structured document extraction + Computer-Use Interactions API (`client.interactions.create` + `previous_interaction_id`, prompt-injection detection enabled).
  - `gemini-4-carbon` (fallback `gemini-4-argon`): Plain-English flag fixes, case risk scoring (0–100), counselor brief, and computer-use recovery escalation after 3 step failures.
  - `gemini-4-neon` (fallback `gemini-4-carbon`): Live official university rules via **Google Search Grounding + URL Context**.
  - `gemini-3.8-flash`: Fast document classification and 6-digit portal email verification code extraction.
- **Production Google Cloud Stack (`asia-south1`):**
  - `aira-web` (Public Cloud Run) + `aira-agent` (Private `--no-allow-unauthenticated` gen2 Cloud Run Playwright worker, 2 vCPU, 4 GiB, concurrency 1, 15m timeout)
  - **Cloud Tasks** (OIDC-authenticated async dispatch) · **Firestore** (cases, atomic single-use tokens, audit logs, live step feed) · **Secret Manager** (API key + generated per-portal passwords) · **Cloud Logging** (structured JSON with zero document text/PII)

---

## Slide 7 — Competitive Edge
| Player | What They Do | Gap vs Aira |
|---|---|---|
| **Ivyward / Babra / Edvi** | AI portal submission (Africa / Grad / Germany) | Not built for Indian documents; no exception-only counselor gate |
| **Veeza AI (YC F26)** | Tourist visas with computer use + human review | No students, no India, no university admissions |
| **Leverage Edu / Ambitio / Leap** | Counseling, shortlists, or agency marketing | No live verifiable computer-use filing with single-use approval tokens |
| **Aira Application Agent** | Indian docs + plain-code checks + live computer-use agent + exception-only human gate | **Built for Indian documents, counselor scale, and one verified record from application to visa** |

---

## Slide 8 — Legal, Compliance & Privacy Built In From Day 1
- **No Common App or UCAS automation:** Hard-blocked in both API and agent action filter; direct university portals (Slate, PeopleSoft, SITS, `/portal`) only.
- **Visa & Legal Boundaries:** One-time student authorisation; visa forms (e.g. US DS-160) prepared only and **must be signed by the student themselves**; no visa advice; no I-20 handling.
- **India DPDP Act Ready (ahead of May 2027):** Consent screen, under-18 parental consent toggle, in-memory-only file reading (zero Cloud Storage), automatic masking of Aadhaar/PAN/Passport/Account numbers, and one-click **Delete My Data**.

---

## Slide 9 — Business Model
- **B2C (Students):** Free document & funds check → **₹7,999 for up to 8 applications**, charged only when the file is verified ready.
- **Education Loan Referrals:** **0.5–1%** of sanctioned loan (~**₹20–40k** per student).
- **B2B (Universities):** **$40–250 per verified, credibility-checked applicant file** — directly protecting UK/global sponsor licences and cutting £4,051/student acquisition waste.

---

## Slide 10 — Live Demo & Proof
- **Live Public URL:** https://aira-web-217073132830.asia-south1.run.app
- **1-Click Judge Test:** Click **Load Sample (Shortfall + Masked IDs)** on `/` → inspect verbatim quotes & plain-code UK funds math → watch live `aira-agent` fill `/portal` and halt at Declaration/Submit → open `/counselor` directly, approve with **`A`**, and submit on `/portal` for a live `APP-...` receipt.
- **Cost Per Case Visible Live:** Full token counts, agent steps, and estimated USD displayed right in the Counselor Queue.
