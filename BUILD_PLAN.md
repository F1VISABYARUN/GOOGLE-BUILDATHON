# BUILD_PLAN.md: Aira Application Agent

Google Startup Buildathon India 2026, Hyderabad (20–21 Nov 2026)

> **Instructions for Antigravity. Read this whole file before you do anything.**
> - Everything in this file is decided. Don't ask what to build.
> - Build **one phase at a time**. At the end of each phase, stop and write a **Phase Report** (template in section 7). Then wait for Arun to reply **"APPROVED PHASE X"** before starting the next phase.
> - If Arun asks for changes, fix them and report again.
> - Never skip a phase and never quietly change the plan. If something is impossible, explain why and suggest the closest option.
> - Check Google's current docs and the real API for every model and method. Never answer from memory, and if you're unsure, say so.
> - Re-read this file whenever you're unsure.

---

## 1. The research behind this plan

These are the findings we built the product around. Use them to understand the problem, but **don't put any statistic in the app UI unless Arun gives it to you.**

### 1.1 The student's problem
- Indian students apply to **8–12 programs**, usually paying **$85 each** (range $0–155). A full round costs about **₹1.2–2 lakh** in fees, tests, WES evaluation and score reports.
- One document mistake can sink an application: a name mismatch, a funds gap, the wrong marksheet sent to WES, or a bank statement that's too old.
- **Refusals are rising everywhere:**
  - **US:** the F-1 refusal rate for Indians was about 61% in FY25, per Shorelight's analysis of State Department data. The State Department didn't publish this figure.
  - **Australia:** 48.6% of Indian student visas refused in 2026-27 so far.
  - **Canada:** 74% of Indian study permits refused in Aug 2025.
  - **UK:** 9.1% refused in the latest quarter.
- **Agents:** students pay consultants **₹30k–1.5 lakh**, and universities also pay those agents **10–25% commission**. India has **no national regulator** for education consultants. Fraud cases include forged bank documents and fake admission letters, with Hyderabad cases too.
- **Rising costs:**
  - The rupee hit a record low of about **96.96/$** (May 2026).
  - Education loans total **₹8.58 lakh crore** (FY26), a 10-year high.
  - The UK's monthly maintenance requirement goes up from **30 Nov 2026**: **£1,570** in London, **£1,203** elsewhere.

### 1.2 The university's problem (the B2B angle)
- Since **1 Jun 2026**, UK universities must keep visa refusals **under 5%**, enrolment **at 95% or higher**, and course completion **at 85% or higher**. If they don't, they lose recruitment slots or their sponsor licence.
  - Bloomsbury Institute lost its licence (Aug 2026).
  - Bucks New University was suspended (Sep 2026).
- Recruiting is expensive: about **£4,051** to enrol one international student, and around 16 applications per enrolment.
- Agent commissions run **$2,000–3,500** per student in the US.
- **Salford** has an open tender for a credibility-check tool: **~£250k, closing 30 Jan 2027**.

### 1.3 Competition
- **Already submitting applications with AI agents:**
  - **Ivyward** (Slate, PeopleSoft, SITS; Africa)
  - **Babra** (grad schools)
  - **Edvi** (Germany, uni-assist)
  - None of them is built for India, and none has a counselor approval step.
- **Veeza AI** (YC Fall 2026) does tourist visas with computer-use agents and human review. It covers no students and no India.
- **Leverage Edu** markets "agentic AI" to consultants, but there's no evidence it actually files applications.
- **Ambitio, Kollegio, Leap** give advice and shortlists only.
- **Our edge:** we're built for Indian documents (marksheets, CGPA, Indian bank and loan letters). A counselor approves at scale, with the counselor handling exceptions only. And one record runs from application to visa.

### 1.4 Why a human approves
- AI agents now finish short computer tasks better than humans (about 90% vs 72% on OSWorld-Verified). On long tasks of 300+ steps, about the length of a real application, they succeed only about **45%** of the time.
- Common failure points: sessions logging out, custom dropdowns, multi-file uploads, pop-ups, captchas and OTPs.
- **The counselor gate is what makes the product reliable. It isn't decoration.**

### 1.5 Legal lines we must respect
- **Common App and UCAS:** their terms ban bots and logging in as the student. **Never automate them.** Use universities' own portals instead (Slate, PeopleSoft, SITS and similar).
- **US DS-160:** someone else can fill it in, but they're named as the preparer, and **the student must sign it themselves.**
- **I-20:** only the university issues it. Aira never handles one.
- **Our scope:** no visa advice, and essays and SOPs get feedback only. The agent types only the student's own facts.
- **Student authorisation:** the student signs a **one-time authorisation** letting Aira create portal accounts and submit applications on their behalf, the same model as Veeza and Ivyward.
- **India's DPDP Act:** most duties start on **13 May 2027**. We build to it now:
  - consent screen
  - delete-my-data
  - parental consent for under-18s
  - breach reporting within 72 hours

### 1.6 Business model (for the pitch, not for the code)
- **Students:** free document check, then **₹7,999 for up to 8 applications**, charged only when the file is ready.
- **Loan referrals:** 0.5–1% of the loan, about ₹20–40k per student.
- **Universities:** $40–250 per verified file.

---

## 2. What we're building

**Aira Application Agent** is a real, live product. It isn't a demo, has no scripted mode and no fake animation.

1. **Upload and authorise.** The student uploads documents (transcript or marksheets, degree, passport, bank statement or loan letter, I-20 or CAS or offer letter) and e-signs the one-time authorisation.
2. **Extract.** Gemini pulls out every fact, each with an **exact quote** from the document.
3. **Check.** **Plain code** (never the model) runs every check and raises flags.
4. **Fill.** A **Gemini computer-use agent** creates the university portal account and fills every page.
5. **Review exceptions.** Only **high-stakes items** go to a human counselor, who approves cases in batches.
6. **Submit.** The agent submits only after counselor approval. **Code blocks Submit** until then.

The student does nothing else, except sign visa forms (like the DS-160) themselves.

**Why it scales:** the AI does the volume and the counselor only handles exceptions. One counselor can clear hundreds of cases a day instead of about 20.

---

## 3. Judging criteria (optimise in this order)

| Criterion | Weight | How we score |
|---|---|---|
| Working product | 30% | Public Cloud Run link; real result in under a minute |
| Technical architecture | 20% | Cloud Run, Cloud Tasks, Firestore, Secret Manager, a separate agent worker, tests, diagram |
| Google AI integration depth | 20% | Four Gemini models plus computer use, Search grounding, URL context, structured output and Batch |
| Problem-solution fit | 15% | Real Indian documents, real checks, real portal |
| UX and accessibility | 10% | Mobile-first, large text, WCAG AA, keyboard navigation, plain English |
| Innovation | 5% | Counselor approves exceptions only; one record from application to visa |

---

## 4. Fixed facts

### 4.1 Environment (already done; don't redo)
- **Local folder:** `C:\dev\aira-buildathon` (moved outside OneDrive so `.env` and `node_modules` are never synced). Node v24.20.0.
- **Google Cloud project:** `continual-air-515306-b6` (GOOGLE BUILDATHON). Region: `asia-south1`.
- **Billing:** linked. Computer use needs paid billing.
- **APIs enabled:** Gemini API (generativelanguage), Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager, Cloud Tasks, Logging, IAM. Vertex AI API is optional, for later.
- **Firestore:** database created in `asia-south1`.
- **Artifact Registry:** repo `aira` (asia-south1).
- **Secret Manager:** `GEMINI_API_KEY`. Locally the key lives in `.env` only.
- **gcloud:** not installed on the laptop yet. Phase 1 installs it.
- **Isolation:** the new GitHub repo is `aira-buildathon`. **Nothing** comes from Arun's live Aira app, its database, its project or its keys.

### 4.2 Models

First call the models list endpoint and use only names that actually appear in it.

| Job | Model | Fallback |
|---|---|---|
| Document extraction | `gemini-4-hydrogen` (Batch API for bulk runs) | `gemini-3.8-flash` |
| Audit, risk scoring, counselor brief | `gemini-4-carbon` | `gemini-4-argon` |
| Computer-use agent | `gemini-4-hydrogen` | `gemini-4-carbon` after 3 failures on the same step, then the counselor queue |
| University rules, with sources | `gemini-4-neon` + Google Search grounding + URL context | `gemini-4-carbon` |
| Small steps (document type, labels, email codes) | `gemini-3.8-flash` | none |

- **Never use** Gemini 1.5, 2.0 or 2.5. `gemini-2.5-computer-use-preview` was shut down on 28 Jul 2026.
- Keep every model name in `server/src/config/models.ts`. Log every fallback, and never fail silently.
- Structured output guarantees the JSON shape, not that the content is true. **Never claim "zero hallucination."**
- **Pricing per 1M tokens (in/out):**
  - Hydrogen: $1.50/$7.50
  - Carbon and Argon: $2/$10 until 30 Nov, then $4/$20
  - Neon: $3/$15
  - 3.8 Flash: $0.75/$3.75 until 31 Dec
  - Search grounding: 5,000 free searches a month, then $14 per 1,000

### 4.3 Computer use (from Google's current docs)
- Use the **Interactions API**: `client.interactions.create` with `previous_interaction_id`. Don't use `generateContent`.
- Tool definition: `{type:"computer_use", environment:"browser", enable_prompt_injection_detection:true}`.
- The model returns coordinates on a **0–999 grid**. Scale them to a 1440×900 viewport: `x/1000*1440`, `y/1000*900`.
- After each action, send back one `function_result` per call, containing the current URL (as text) and a PNG screenshot.
- If `safety_decision.decision === "require_confirmation"`, pause and send it to the counselor queue. Send `safety_acknowledgement:true` only after approval.
- Clear fields with **Control+A**, not Meta+A (we run on Linux).
- Cloud Run settings:
  - image `mcr.microsoft.com/playwright`
  - gen2 execution environment
  - 2 vCPU, 4 GiB memory
  - concurrency 1
  - timeout 15 min
  - headless Chromium with `--disable-dev-shm-usage`

---

## 5. The phases

Each phase ends with a **Phase Report** and a wait for **"APPROVED PHASE X"**. Push to GitHub and open a draft PR in every phase.

### PHASE 0: Repo safety and plan check (about 15 min)
**Goal:** a safe, empty repo, and confirmation that you understood this plan.

1. Create `.gitignore` containing `.env`, `node_modules/`, `dist/`, `*.log`, `.DS_Store`. Then run `git init`.
2. Run `git check-ignore .env` and show the output.
3. Save this file as `BUILD_PLAN.md` in the repo root.
4. Create `.env.example` with these keys and no real values: `GEMINI_API_KEY=`, `GOOGLE_CLOUD_PROJECT=continual-air-515306-b6`, `USE_VERTEX=false`, `PORT=8080`. Tell Arun to copy it to `.env` and paste his key there himself. **Never ask for the key in chat.**
5. Write a five-line summary of the product and list the six phases in your own words.

**Done when:** `.env` is ignored, the plan is saved, and your summary matches this plan.
**Then:** Phase Report → wait for APPROVED PHASE 0.

### PHASE 1: Live link with a real Gemini call (target 2 PM Fri)
**Goal:** a judge can open a public Cloud Run URL and get a real Gemini reply.

1. Create a monorepo:
   - `/web`: React + Vite + TypeScript + Tailwind
   - `/server`: Node + Express + TypeScript
   - `/agent`: empty for now
   One Cloud Run service (`aira-web`) serves both the built web app and the API.
2. `server/src/config/models.ts` holds all the model names from section 4.2.
3. `server/src/gemini.ts` uses `@google/genai` and reads `GEMINI_API_KEY`. If `USE_VERTEX=true`, it switches to `vertexai:true` with the project and location, with no other code changes.
4. Endpoints:
   - `GET /api/health` returns `{ ok: true }`.
   - `GET /api/models` returns the model names starting with `gemini-4` or `gemini-3.8`.
   - `POST /api/hello` calls `gemini-4-hydrogen` and falls back to `gemini-3.8-flash`. It returns `{ model, text, latencyMs }`.
5. Web page: "Aira Application Agent" title, a button that calls `/api/hello`, and the model list. Mobile-first, large text.
6. Write a Vitest test for the fallback logic.
7. Dockerfile: `node:24-slim`, multi-stage, listens on port 8080.
8. Give Arun step-by-step instructions to install the gcloud CLI on Windows, then these commands:
   - `gcloud auth login`
   - `gcloud config set project continual-air-515306-b6`
   - Grant the Cloud Run service account the `roles/secretmanager.secretAccessor` role on `GEMINI_API_KEY`.
   - `gcloud run deploy aira-web --source . --region asia-south1 --allow-unauthenticated --max-instances 2 --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest`
9. Run it locally first, then deploy.

**Done when:** the public URL shows a Gemini reply and the model list, and tests pass.
**Then:** Phase Report → wait for APPROVED PHASE 1.

### PHASE 2: Upload, extraction with quotes, checks and flags (target 5 PM Fri)
**Goal:** upload real documents and see facts with quotes, and flags, on the live link.

1. **Consent and authorisation screen**, shown before upload:
   - what we store (facts, quotes, flags)
   - that files are deleted right after reading
   - how to delete your data
   - an under-18 parental consent checkbox
   - the one-time authorisation text, with a typed-name e-signature and timestamp
2. **Upload:** `multer` with memory storage only. Up to 5 files, 10 MB each, PDF/JPG/PNG. **No Cloud Storage.**
3. **Classify:** `gemini-3.8-flash` labels each document's type.
4. **Extract:** `gemini-4-hydrogen` with structured output (`zod` schema). It returns:
   - `fullText`
   - `facts[]`, each with `{field, value, quote, page, confidence}`
   - Fields: name, date of birth, passport number, degree, university, CGPA and scale, backlogs, graduation date, bank balance, currency, statement dates, loan amount, sponsor, course, institution, tuition, living cost, start date.
5. **Quote validation (code):** normalise whitespace and case. If a quote isn't found in `fullText`, mark the fact **"needs review"**.
6. **Masking:** passport and account numbers show only the last 4 digits.
7. **Checks** (plain TypeScript, in `server/src/checks/`):
   - **Funds vs required cost.** The cost comes from the I-20, CAS or offer letter, or from the counselor. Never from the model.
   - **Name match across all documents.** Ignore case, word order, extra spaces and initials.
   - **GPA scale conversion and backlog count.**
   - **Document dates.** Flag a bank statement older than the allowed window.
   - **UK rules** in `rules/uk.json`, each with its source link and an "as of" date:
     - £1,570 a month in London, £1,203 elsewhere, up to 9 months
     - the 28-day rule
   - **Exchange rate:** a dated, visible value the counselor can edit. Never hard-coded.
8. **Flags:** red, amber or green, each with the quote it rests on.
9. **Explain:** `gemini-4-carbon` writes each flag in plain words plus a suggested fix. Fall back to argon.
10. **Store in Firestore:** `cases/{id}` holds facts, quotes, flags, status, consent and authorisation. **Never document files.**
11. **Student results page:** facts with their quotes, flags with fixes, and a status timeline.
12. **Vitest:** quote validation, each check, name matching, money maths.

**Done when:** on the live URL, uploading documents shows facts with quotes and correct flags, and tests pass.
**Then:** Phase Report → wait for APPROVED PHASE 2.

### PHASE 3: Counselor queue (target 8 PM Fri)
**Goal:** a counselor clears only the exceptions, fast.

1. **Risk score:** `gemini-4-carbon` scores every case.
2. **What goes to the counselor:** any red flag, a quote that wasn't found, low confidence, free-text answers the documents don't support, a declaration or legal statement, a fee payment, or a safety confirmation.
3. **Green cases** are pre-approved by rules in code and can be batch-approved.
4. **`/counselor`**, behind a passcode stored in Secret Manager (`COUNSELOR_PASSCODE`):
   - a queue sorted by risk
   - **one case per screen:** the issue, the quote, the suggested fix, and Approve / Edit / Reject
   - keyboard shortcuts (A, E, R, J/K)
   - batch approve for green cases
   - editable rules and exchange rate
5. **Approval** creates a **single-use token** in Firestore, tied to the case ID and the portal URL, with who approved it and when.
6. **Audit log:** every action is recorded with a timestamp.
7. **Delete my data:** removes the case and its facts. Show a confirmation.
8. **Rate limits:** 30 runs per hour and 200 per day. Show a clear message when a limit is hit.

**Done when:** a counselor can clear a case in seconds, and approvals and rejections are saved with tokens.
**Then:** Phase Report → wait for APPROVED PHASE 3.

### PHASE 4: The computer-use agent (target midnight Fri)
**Goal:** the agent creates an account and fills a portal live. Submit stays blocked until a counselor approves.

1. **`/portal`:** our own university-style application, used for tests and the backup video. Pages:
   - account creation with email verification code
   - personal details
   - academics (with a custom dropdown and a date picker)
   - funding
   - document upload
   - declaration
   - Submit
   Its Submit endpoint checks for an approval token and returns **403** without one.
2. **`/agent` service:** Playwright and Chromium, deployed as the Cloud Run service `aira-agent` with the settings in section 4.3. It's fed by a **Cloud Tasks** queue. Use `--no-allow-unauthenticated`, invoked only by Tasks.
3. **The loop:** screenshot → `interactions.create` (hydrogen) → run the action → `function_result` with URL and screenshot.
   - Max 40 steps per page group.
   - Save state to Firestore after every step, so a run can resume.
4. **Action filter** (code, runs before every action):
   - Only allowlisted domains.
   - **Block** any click on submit, pay, confirm application, declaration or sign unless a valid approval token exists.
   - Block payment pages.
   - Unit-test this.
5. **Account creation:** use the student's own email and phone.
   - Email codes are read from a connected Gmail inbox (read-only, filtered to portal senders) or from emails forwarded to the student's Aira inbox.
   - Generate a password per portal and store it **only in Secret Manager**.
   - On a captcha or phone OTP: pause, notify, then resume.
6. **Escalation:** after 3 failures on the same step, switch to `gemini-4-carbon`. If it still fails, send the case to the counselor queue.
7. **Live step feed** in the UI: thumbnail, action and intent for each step.
8. **Safety:** if the model returns a `require_confirmation` safety decision, send it to the counselor queue. Page text and document text are treated as data, never instructions.
9. **University rules:** `gemini-4-neon` with Search grounding and URL context reads the chosen university's real requirements page and shows each rule with its source link.
10. **Real portal test:** Arun picks one direct university portal (Slate or PeopleSoft, **never Common App or UCAS**) and runs it with his own real data and consent. Submit, or save as a draft.

**Done when:**
- The agent creates an account and fills `/portal` live on Cloud Run.
- Submit returns 403 until approval, then succeeds.
- A real portal is filled at least up to the draft stage.

**Then:** Phase Report → wait for APPROVED PHASE 4.

### PHASE 5: Polish, proof and submit (freeze 8:30 AM Sat)
**Goal:** judge-ready.

1. **Accessibility:** WCAG AA contrast, labels on every input, full keyboard navigation, large text, plain English everywhere.
2. **Cost per case** on the counselor dashboard: tokens and steps.
3. **`docs/architecture.md`:** a Mermaid diagram covering web, API, Firestore, Secret Manager, Cloud Tasks, the agent worker, Gemini models and Logging.
4. **README:** problem, solution, architecture, which Google services and models are used and why, how to run it, and the legal and privacy design.
5. **Logging:** Cloud Logging records model, latency and fallback for every call. **No document contents in logs.**
6. **Final check:** all tests pass, then the final deploy of both services.
7. **Demo script** (2 minutes):
   1. Upload real documents. Flags appear with quotes.
   2. The agent creates the account and fills the portal live.
   3. Submit is blocked.
   4. The counselor approves.
   5. The application is submitted.
8. **Backup:** record the same flow on `/portal` with SAMPLE documents.
9. Give Arun the final URLs, repo link and video file to submit before 9 AM.

**Done when:** the live link works end to end, the backup video is recorded, and it's submitted.
**Then:** Final Report.

### Stretch (only after Phase 5, and only if Arun approves)
- Switch to Vertex AI (`USE_VERTEX=true`) and enable the Vertex AI API.
- SOP feedback (feedback only, never written for the student).
- A voice gap-check with `gemini-3.8-live`.

---

## 6. Rules for every phase
- **Secrets:** never put the key or passwords in code, logs, commits or chat.
- **Truth:**
  - Money maths and checks are plain code, never the model.
  - No hard-coded exchange rates or university costs.
  - No statistics in the UI unless Arun gives them.
- **Privacy:** files stay in memory only, and Firestore stores facts, quotes and flags only.
- **Stack:**
  - **Frontend:** React, Vite, TypeScript, Tailwind.
  - **Backend:** Node, Express, TypeScript.
  - **Packages:** `@google/genai`, `@google-cloud/firestore`, `@google-cloud/tasks`, `@google-cloud/secret-manager`, `multer`, `zod`, `playwright`, `vitest`.
- **Tests:** they must pass before every deploy.
- **Commits:** small, with clear messages. Open a draft PR per phase.
- **Errors:** never fail silently. Show a clear, plain message to the user, and log the details.

---

## 7. Phase Report template

At the end of every phase, reply in exactly this format, in simple words with no jargon:

```
PHASE X REPORT

1. What I built (plain words, 3–6 lines)
2. How it works (one short paragraph a non-coder understands)
3. How to test it yourself (exact steps + live URL)
4. Proof (test results, model list, screenshots or log lines)
5. Google AI / Cloud used in this phase
6. What did not work or is risky
7. Commands you need to run (if any)
8. PR link
9. Next phase: what I will build (3 lines)

Waiting for "APPROVED PHASE X" before starting the next phase.
```

---

## 8. Schedule at a glance

| Phase | What | Target |
|---|---|---|
| 0 | Repo safety, plan check | 12:45 PM Fri |
| 1 | Live link with Gemini | 2 PM Fri |
| 2 | Upload, extraction with quotes, checks, flags | 5 PM Fri |
| 3 | Counselor queue | 8 PM Fri |
| 4 | Computer-use agent, Submit gate | Midnight Fri |
| 5 | Polish, video, submit | 8:30 AM Sat (submit before 9 AM) |
