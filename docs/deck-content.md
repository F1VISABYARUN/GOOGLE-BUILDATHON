# Aira Application Agent — Verified Pitch Deck Content
**Google Startup Buildathon India 2026 — Hyderabad**

> Every statistic below was independently verified from primary 2025–2026 sources (GOV.UK, UKCISA, HESA, Russell Group, LSE, Qualification Check, ApplyBoard Trust Centre, The PIE News, The Hindu, NewsMeter, Times of India, OSWorld 2.0). Never claim "zero hallucination" — state our real guarantee: plain code does all money math & checks, every fact requires a verbatim quote from the document, and anything else is marked **"needs review"**.

---

## Slide 1 — Title & One-Line Pitch
- **Product:** Aira Application Agent
- **One-Line Pitch:** Families have the money but can't prove it on paper. Universities lose their licence over refusals. Aira catches document mistakes in plain code, fills direct portals with Gemini Computer Use, and requires a human counselor's single-use approval token before anything is submitted.
- **Live App:** https://aira-web-217073132830.asia-south1.run.app
- **Event:** Google Startup Buildathon India 2026, Hyderabad (20–21 Nov 2026)

---

## Slide 2 — The Student & Family Pain (Preventable Refusals + Agent Fraud)
- **Paperwork refusals, not lack of money:**
  - **47% of 1,370 Canadian study permit refusal letters** (638 cases) failed specifically on **money paperwork** — families often had the funds but failed to prove them cleanly (*ApplyBoard Trust Centre / The PIE News*, Jul 2026). Canada rejected **74%** of Indian study permits in Aug 2025 (*IRCC / Reuters*, Nov 2025).
  - **One low day in the bank sinks a UK visa:** UKVI & **LSE (Oct 2026)** warn that dropping below unpaid CAS tuition + 9 months' living for **even a single day** during the 28-day window triggers refusal — and UK thresholds jump **again in 10 days (30 Nov 2026, HC 584)** to **£1,570/mo London (£14,130)** and **£1,203/mo elsewhere (£10,827)**.
  - **Silent name mismatches stall intakes:** WES holds files and locks self-edits when Indian marksheet initials/surname order diverge from passports.
- **Opaque, unregulated consultants (right here in Hyderabad & across India):**
  - **Hyderabad (12 Oct 2026):** Ranga Reddy Consumer Commission ordered *Paramount Global* (Hitec City) to refund **₹2,24,200 + interest** after taking fees for 10 US applications and **never submitting them** (*NewsMeter / Indian Express*).
  - **Hyderabad (Jun 2025):** RGIA Police arrested *Dhanalaxmi Overseas* MD after deported students exposed **15 forged-degree cases** (*The Hindu*).
  - **Ludhiana / Barnala (Jul 2026):** *Smart Study Immigration* secretly submitted **forged ₹30–35L bank statements** behind **30+ students'** backs (*Times of India*). Punjab logged **3,225 FIRs** against fraudulent agents in 3 years (*NIE*, Feb 2025).

---

## Slide 3 — The University Pain (B2B Buyer Facing an Existential Cliff)
- **UKVI halved the refusal cap on 1 June 2026:** Under Basic Compliance Assessment (BCA) rules, universities must keep visa refusals **strictly under 5%** (down from 10%), enrolment **≥95%**, and completion **≥85%** (rising to ≥90% in Jun 2027) — graded on a public **Red/Amber/Green (RAG)** weakest-link scale (*GOV.UK / UKCISA*, Jun 2026).
- **Licences are already being pulled:**
  - **Bloomsbury Institute:** student sponsor licence **revoked 5 Aug 2026** (*GOV.UK*).
  - **Buckinghamshire New University (Bucks New):** licence **suspended 30 Sep 2026**, blocking CAS issuance (*GOV.UK / THE*).
  - **India compliance shock (Nov 2026):** **89% of Indian students called to UKVI credibility interviews** (May–Oct 2026) were rejected (*The PIE News*, 18 Nov 2026), pushing universities to **pre-emptively withdraw >5% of Indian offers** (up from 1.2%, *FT / TOI*, Oct 2026).
- **Admissions fraud & active six-figure budgets RIGHT NOW:**
  - Admissions fraud jumped **38% YoY to 3.95%** across 17,663 checks at 40 UK universities (**4.2% India**, *Qualification Check*, Jul 2026); **~40% of student visa fraud is forged documents** (bank statements & transcripts, *Russell Group*, Jun 2026).
  - UK universities spend **£500M+/yr** on agent commissions (15%–25% of Year 1 tuition; £2,000–£8,000+/enrolment, *The Guardian / Wonkhe*) to protect **£12.4B** in international tuition (23% of UK sector income, *HESA*, May 2026).
  - **Live tenders this month:** **University of Salford** (£250k credibility & fraud platform, 18 Nov 2026) and **Abertay University** (£225k pre-CAS credibility & compliance service, 28 Oct 2026).

---

## Slide 4 — The Counselor / Agency Pain & Why Not Just ChatGPT?
- **Counselors drowning in manual portals & WhatsApp chaos:**
  - Peak-season counselors juggle **40–80 active files** across WhatsApp PDFs and spend **45–90 min/portal** re-typing data (up to ~60% of their day), while Indian agency demand contracted sharply (35%–40% center closures in Punjab; Hyderabad branch closures) and UK **Agent Quality Framework (AQF)** ties survival to sub-4% refusal rates.
- **Why ChatGPT / Gemini Chat cannot solve this:**
  1. **LLM math fails silently:** Raw LLMs hit ~**63.5%** on multi-step financial math vs ~**95%–100%** with code, and *FinQA* ("Confidently Wrong") shows **15%–23%** wrong answers even at 100% consensus. ChatGPT never computes your **28-day lowest daily closing balance** against unpaid CAS tuition + living costs.
  2. **No cross-document verification or accountability:** Chat windows don't verify verbatim quotes against source text, mask Aadhaar/PAN/Passport IDs, fill 6-page university portals, or issue auditable single-use approval tokens.
  3. **Unsupervised browser agents still fail ~80% of long workflows:** On **OSWorld 2.0** (`arXiv:2606.29537`, Jun 2026), frontier agents fail **79.4%–87%** of 300+ step workflows because they guess instead of pausing.

---

## Slide 5 — Solution: Bounded Autonomy Built for Refusal Prevention
1. **DPDP Consent & 1-Click Sample Audit:** Student signs one-time authorisation; uploaded PDFs stay in memory only and are deleted immediately (zero Cloud Storage).
2. **Multimodal Extraction + Verbatim Quotes (`gemini-4-hydrogen`):** Extracts structured facts from messy Indian marksheets, CAS/offer letters, passports, and bank/loan statements.
3. **Plain-Code Verification (Never LLM Math):**
   - Checks the **LOWEST daily closing balance across the 28-day UK window** (flagging the exact dip date + verbatim quote even if the final balance recovers).
   - Computes exact **`unpaid CAS tuition (tuition − deposit) + UK 9-month living`** with visible dated FX rates.
   - Verifies every quote verbatim in the source text (marking missing quotes **"needs review"**), checks cross-doc name consistency, and masks Passport, Account, Aadhaar, and PAN numbers in facts & quotes.
4. **Computer-Use Agent (`aira-agent`):** Isolated Cloud Run Playwright worker fills direct university portals via the **Gemini Interactions API** — with SSRF protection, domain allowlist, and a plain-code action filter blocking Common App, UCAS, payments, and Submit.
5. **Exception-Only Counselor Queue (`/counselor`) + Hard 403 Submit Gate:** Clean green cases clear in 1 click via **Batch Approve** (never auto-issued a token); only exceptions reach the counselor one-per-screen (`A`/`E`/`R`/`J`/`K`), and `/portal` enforces **HTTP 403** until a single-use Firestore approval token is supplied.

---

## Slide 6 — Deep Google AI & Cloud Architecture (`asia-south1`)
- **4 Gemini Models — Each With a Specific Job:**
  - **`gemini-4-hydrogen`** (fallback `gemini-3.8-flash`): Zod-structured document extraction + Computer-Use Interactions API (`client.interactions.create` + `previous_interaction_id`, `enable_prompt_injection_detection: true`, `safety_decision: require_confirmation` honored per Google's official docs).
  - **`gemini-4-carbon`** (fallback `gemini-4-argon`): Plain-English flag fixes, case risk scoring (0–100), counselor brief, and browser step recovery after 3 failures.
  - **`gemini-4-neon`** (fallback `gemini-4-carbon`): Live official university requirements via **Google Search Grounding + URL Context** (clickable `.gov.uk` / university citations).
  - **`gemini-3.8-flash`**: Sub-second document classification & 6-digit email verification code extraction.
- **Production Google Cloud Stack:**
  - **Cloud Run:** Public `aira-web` + private `--no-allow-unauthenticated` gen2 `aira-agent` Playwright worker (2 vCPU, 4 GiB, concurrency 1, 15m timeout) with browser-layer SSRF/redirect route blocking.
  - **Cloud Tasks** (OIDC-authenticated async dispatch) · **Firestore** (cases, atomic single-use tokens, audit logs, live step feed) · **Secret Manager** (`GEMINI_API_KEY` + per-portal passwords) · **Cloud Logging** (structured JSON, zero doc text/PII).

---

## Slide 7 — Competitive Landscape
| Player | Focus | Gap vs Aira |
|---|---|---|
| **Ivyward** | B2C student portal auto-fill (Africa/global) | No Indian document compliance, no 28-day lowest-balance engine, no B2B counselor exception queue |
| **Veeza AI (YC F26)** | B2C tourist visas + HITL (MENA/Egypt) | Validates computer-use + HITL model, but zero students, zero universities, zero India |
| **Leverage Edu / Leap / Ambitio** | B2C agencies / shortlists / chatbots | Compete *against* regional agencies; no verifiable quote-backed compliance engine + auditable portal filing |
| **Aira Application Agent** | **Indian docs + plain-code refusal checks + Gemini Computer Use + exception-only counselor gate** | **One verified, quote-backed record from application to visa — protecting students, agencies, and university sponsor licences** |

---

## Slide 8 — Legal, Safety & India DPDP Privacy By Design
- **Hard-blocked in code:** No Common App or UCAS automation; SSRF-locked `/api/agent/runs`; browser network interceptor blocks redirects and internal/metadata IPs.
- **Human & Legal Boundaries:** One-time student authorisation; students sign visa forms (like US DS-160) themselves; no visa advice; no I-20 handling.
- **India DPDP Act Ready (ahead of May 2027):** Consent screen, under-18 parental consent toggle, in-memory-only file reading (zero Cloud Storage), automatic masking of Aadhaar/PAN/Passport/Account IDs, and one-click **Delete My Data**.

---

## Slide 9 — Business Model
- **B2C (Students):** Free document & 28-day funds check → **₹7,999 for up to 8 applications**, charged only when the file is verified ready.
- **Education Loan Referrals:** **0.5–1%** of sanctioned loan (~**₹20–40k** per student).
- **B2B (Universities & Agencies):** **$40–$250 per verified, quote-backed applicant file** — <1.5% of Year 1 tuition and a fraction of £225k–£250k credibility tenders and £2,000–£8,000 agent commissions, directly defending the UKVI 5% BCA cap.

---

## Slide 10 — Live Zero-Setup Judge Demo
- **Live Public URL:** https://aira-web-217073132830.asia-south1.run.app
- **Try It Yourself in 4 Clicks (Zero Setup):**
  1. Click **`Try with sample documents →`** on `/` → instant UK funds shortfall math, verbatim quotes, masked IDs, and **`Start Application Agent`**.
  2. Open **`/counselor`** directly → enter approver name → click **`Approve & Issue Token`** → copy the full 52-char single-use token.
  3. Open **`/portal`** → click **`6. Submit`** → click **`Submit Application`** without token → red **`403 — Counselor approval required`**.
  4. Paste token → click **`Submit Application`** → **`HTTP 200`** live **`APP-...`** receipt + full Firestore audit trail + live Cost Per Case visible in `/counselor`.
