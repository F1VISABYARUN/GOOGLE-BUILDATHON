# Aira Application Agent — System Architecture

## End-to-End Architecture Diagram

```mermaid
flowchart TD
    Student["Student Browser (Mobile-First Web UI)"] -->|"HTTPS (/, /portal)"| WebRun["Cloud Run: aira-web (React + Express API)"]
    Counselor["Human Counselor Browser"] -->|"HTTPS (/counselor + X-Counselor-Passcode)"| WebRun

    WebRun -->|"In-Memory Upload (Multer) -> Deleted Immediately"| Pipeline["Document & Audit Pipeline"]

    Pipeline -->|"1. Classify Doc Type"| GFlash["Gemini 3.8 Flash"]
    Pipeline -->|"2. Extract Facts + Quotes (Zod Schema)"| GHydrogen["Gemini 4 Hydrogen (Fallback: 3.8 Flash)"]
    Pipeline -->|"3. Quote Check, ID Masking, Funds/Name/Date Math"| PlainCode["Plain TypeScript Checks (Never LLM Math)"]
    Pipeline -->|"4. Flag Fixes & Risk Score (0-100)"| GCarbon["Gemini 4 Carbon (Fallback: 4 Argon)"]
    WebRun -->|"University Rules + Search + URL Context"| GNeon["Gemini 4 Neon (Fallback: 4 Carbon)"]

    WebRun -->|"Store Facts, Quotes, Flags, Tokens, Audit Logs"| Firestore["Google Cloud Firestore (asia-south1)"]
    WebRun -->|"Read GEMINI_API_KEY & COUNSELOR_PASSCODE"| Secrets["Google Cloud Secret Manager"]
    WebRun -->|"Enqueue Agent Job (OIDC Token)"| Tasks["Google Cloud Tasks (aira-agent-queue)"]

    Tasks -->|"Authenticated POST /tasks/run-agent"| AgentRun["Cloud Run: aira-agent (Private Playwright gen2, 2 vCPU, 4 GiB)"]
    AgentRun -->|"Interactions API (client.interactions.create)"| GHydrogen
    AgentRun -->|"Escalate After 3 Failures on Same Step"| GCarbon
    AgentRun -->|"Read Email Verification Code"| GFlash
    AgentRun -->|"Per-Portal Passwords Only"| Secrets
    AgentRun -->|"Save Live Step Feed + Thumbnails"| Firestore
    AgentRun -->|"Plain-Code Action Filter (Blocks Submit/Pay/Common App/UCAS)"| Portal["Direct University Portal / Test /portal"]

    Portal -->|"Verify & Consume Single-Use Token (403 Without Token)"| Firestore

    WebRun -->|"Structured JSON Logs (Model, Latency, Fallback — Zero Doc Text)"| Logging["Google Cloud Logging"]
    AgentRun -->|"Structured JSON Logs (Model, Latency, Step — Zero Doc Text)"| Logging
```

## Key Architectural Guarantees

1. **Deterministic Truth & Math:** Currency conversion, UK maintenance checks (unpaid CAS tuition + £1,570/mo London or £1,203/mo outside London × 9 months), 28-day holding rules, name matching, quote verification, and Aadhaar/PAN/passport/account masking all run in plain TypeScript (`server/src/checks/`). Any fact whose quote is not found verbatim in the document is marked **"needs review"**.
2. **Human-in-the-Loop Submit Gate (Defense in Depth):**
   - **Layer 1 (Agent Action Filter):** `agent/src/actionFilter.ts` runs before every browser action and blocks Common App, UCAS, payment pages, and clicks on Submit / Declaration / Sign unless a valid counselor approval token exists.
   - **Layer 2 (Portal Server Enforcement):** `/portal`'s Submit endpoint verifies and atomically consumes a single-use token in Firestore (`approval_tokens/{token}`) tied to `(caseId, portalUrl, approvedBy, approvedAt)` and returns **HTTP 403** without one.
   - **No Automatic Tokens:** Clean green cases are pre-approved by rules for fast **batch approval**, but never receive a token until an authenticated counselor clicks **Approve (`A`)** or **Batch Approve**.
3. **Strict Isolation & Privacy:**
   - Uploaded documents stay in `multer` memory buffers only and are cleared immediately after extraction — **no Cloud Storage**.
   - Firestore stores only extracted facts, masked identifiers, verbatim quotes, flags, consent records, tokens, and audit logs.
   - Per-portal passwords are generated randomly and stored **only in Secret Manager**.
   - Cloud Logging records model name, latency, fallback flag, and token counts — **never document contents or secrets**.
