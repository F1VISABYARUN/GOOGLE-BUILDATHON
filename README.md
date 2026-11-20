# Aira Application Agent

**Google Startup Buildathon India 2026 — Hyderabad**

- **Live Public URL:** https://aira-web-217073132830.asia-south1.run.app
- **Counselor Exception Queue:** https://aira-web-217073132830.asia-south1.run.app/counselor
- **Direct Application Test Portal (`/portal`):** https://aira-web-217073132830.asia-south1.run.app/portal
- **Architecture Diagram:** [docs/architecture.md](docs/architecture.md)
- **2-Minute Demo Script:** [docs/demo-script.md](docs/demo-script.md)

---

## Problem

Indian students applying to study abroad juggle multiple university portals, marksheets, CGPA scales, bank statements, education loan letters, and strict financial rules. One overlooked error — a name mismatch across documents, an insufficient funds calculation, or a bank statement missing the UK 28-day holding window — can derail an admission or visa. Traditional agencies charge steep fees and take college commissions while manual counselors drown in repetitive form filling.

## Solution

**Aira Application Agent** combines Gemini's multimodal understanding and browser computer use with plain-code deterministic checks and a human counselor safety gate:

1. **Upload & Authorise:** The student completes a DPDP-ready privacy consent notice and signs a one-time authorisation.
2. **Extract with Quotes:** Gemini extracts structured facts paired with verbatim quotes from uploaded PDFs/images (held in memory only and deleted immediately after reading).
3. **Plain-Code Verification:** TypeScript code verifies every quote against the extracted document text (marking unfound quotes as **"needs review"**), masks passport, bank account, Aadhaar, and PAN numbers to the last 4 digits, and runs exact funds, name, GPA/backlog, and date checks.
4. **Exception-Only Counselor Queue:** Clean green cases are pre-approved by code rules for one-click batch approval; only high-stakes exceptions (red flags, unverified quotes, low confidence, declarations, safety confirmations) appear one-per-screen on `/counselor` with keyboard shortcuts (`A`, `E`, `R`, `J`/`K`), cost-per-case tracking, and timestamped audit logs.
5. **Computer-Use Agent with Hard Submit Gate:** An isolated Playwright worker on Cloud Run (`aira-agent`), dispatched via Cloud Tasks, creates the portal account, reads email verification codes, and fills every form page using the Gemini Interactions API (`client.interactions.create`). Both a plain-code action filter and `/portal`'s Submit endpoint (**HTTP 403**) block submission until a human counselor issues a single-use approval token.

---

## Google AI Models & Cloud Services Used

| Service / Model | Role in Aira Application Agent | Why Chosen |
|---|---|---|
| **`gemini-4-hydrogen`** (fallback: `gemini-3.8-flash`) | Multimodal document extraction with Zod structured output + Computer-Use browser agent (`client.interactions.create`) | High accuracy on dense Indian marksheets/bank statements and native browser computer-use tool support |
| **`gemini-4-carbon`** (fallback: `gemini-4-argon`) | Plain-English flag explanations & fixes, case risk scoring (0–100), counselor brief, and computer-use escalation after 3 step failures | Strong reasoning for complex multi-document audits and recovering stuck browser steps |
| **`gemini-4-neon`** (fallback: `gemini-4-carbon`) | Live university requirements lookup with **Google Search grounding** and **URL Context** | Pulls live requirements straight from official university pages with clickable source URLs |
| **`gemini-3.8-flash`** | Fast document classification and extracting 6-digit portal email verification codes | Sub-second latency and low cost for targeted classification & extraction |
| **Cloud Run (`aira-web` + `aira-agent`)** | Public web/API server + private `--no-allow-unauthenticated` Playwright worker (`gen2`, 2 vCPU, 4 GiB, concurrency 1, 15m timeout) | Scales cleanly and isolates untrusted browser automation from the public web server |
| **Cloud Tasks (`aira-agent-queue`)** | Dispatches computer-use runs to private `aira-agent` using OIDC tokens | Reliable async execution for multi-minute portal runs without blocking HTTP requests |
| **Firestore (`asia-south1`)** | Stores `cases`, `approval_tokens`, `audit_logs`, `settings`, `agent_runs`, and `/portal` state | Real-time state persistence, single-use token transactions, and live step feed checkpoints |
| **Secret Manager** | Stores `GEMINI_API_KEY`, `COUNSELOR_PASSCODE`, and generated per-portal passwords | Keeps all credentials out of code, Git, Firestore, and logs |
| **Cloud Logging** | Structured JSON logs for model, latency, fallback, and token counts | Full observability with zero document text or PII in logs |

---

## Legal, Safety & Privacy Design

- **No Common App or UCAS Automation:** Hard-blocked in both `/api/agent/runs` (HTTP 403) and `agent/src/actionFilter.ts`. Direct university portals and `/portal` only.
- **No Unfounded "Zero Hallucination" Claims:** Money math and eligibility rules run in plain TypeScript code, never in the LLM. Every extracted fact requires a verified quote in the document text; otherwise it is marked **"needs review"**.
- **Student Authorisation & Visa Signing:** Students e-sign a one-time authorisation before processing. Visa forms (such as US DS-160) are prepared only and **must be signed by the student themselves**.
- **India DPDP Act Readiness:** Built-in consent screen, under-18 parental consent toggle, in-memory-only file reading with immediate deletion (no Cloud Storage), automatic masking of passport/account/Aadhaar/PAN numbers in facts and quotes, and one-click **Delete My Data** (`DELETE /api/cases/:id`).
- **Rate Limiting:** Enforces 10 analyses/hour per IP, 30 runs/hour, and 200 runs/day with clear plain-English messages.

---

## Running Locally & Testing

### Prerequisites
- Node.js 24+
- Copy `.env.example` to `.env` and add your `GEMINI_API_KEY` and `COUNSELOR_PASSCODE` locally (never commit `.env`).

### Install, Test, and Build
```bash
npm run install:all
npm test
npm run build
```

### Start Locally
```bash
npm start
# Opens on http://localhost:8080 (serves both /web and /server API)
```

### Deploy to Google Cloud Run (`asia-south1`)
```bash
# Deploy private Playwright agent worker
gcloud run deploy aira-agent --source ./agent --region asia-south1 --no-allow-unauthenticated \
  --execution-environment gen2 --cpu 2 --memory 4Gi --concurrency 1 --timeout 900 --max-instances 2 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=continual-air-515306-b6 \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest

# Deploy public web + API service
gcloud run deploy aira-web --source . --region asia-south1 --allow-unauthenticated --max-instances 2 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=continual-air-515306-b6,PUBLIC_WEB_URL=<WEB_URL>,AGENT_WORKER_URL=<AGENT_URL>,AGENT_INVOKER_SA=<SA_EMAIL>,CLOUD_TASKS_QUEUE=aira-agent-queue,CLOUD_TASKS_LOCATION=asia-south1 \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```
