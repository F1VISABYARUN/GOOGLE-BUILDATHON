# Aira Application Agent — Locked 8-Slide Pitch Deck Content
**Google DeepMind | Google Cloud — Startup Buildathon India 2026**
*(PDF export: official Buildathon template styling, Instruction Slide 1 removed, ≥14pt body text, ≤40 words per box, zero `file://` links, <5 MB)*

---

## Slide 1 — Cover *(Template Page 2)*
- **Team Name:** AIRA AI
- **Team Size:** 1 · Founder: Arun Reddy (`teamarunreddy@gmail.com`)
- **Live Website:** `https://aira-web-217073132830.asia-south1.run.app`
- **Problem Statement:** Families have the money to study abroad but get refused on paperwork mistakes; UK universities risk losing their sponsor licence over 5% refusals. Aira checks real documents in code, fills direct portals with Gemini, and requires human approval before Submit.

---

## Slide 2 — Problem Statement *(Template Page 3)*

### Box 1: Students
- 47% of 1,370 Canadian refusal letters were money paperwork. "Many likely had the money. They just could not prove it." *(ApplyBoard via ICEF, Jul 2026)*
- One low day in the 28-day window can sink a UK visa *(LSE, Jun 2026)*. Living costs rise to £1,570 London / £1,203 elsewhere from 30 Nov 2026.
- Consultants without accountability: ₹2.24L refund ordered for applications never submitted *(Ranga Reddy consumer commission, Oct 2026)*; fake bank papers for 40–45+ students in Ludhiana *(TOI, Jul 2026)*.

### Box 2: Universities
- UK refusal cap is now under 5% (was 10%) since 1 Jun 2026. Bloomsbury lost its licence *(Aug 2026)*; Bucks New University was suspended *(Sep 2026)*.
- ~4% of screened applications were fraud, 40% of it forged documents *(Russell Group, Jun 2026)*.
- Buying now: Salford £250k *(Nov 2026)* and Abertay £225k *(Oct 2026)* credibility-check tenders.

### Bottom Strip: Why Not ChatGPT?
> "Chatbots answer questions. They don't open your bank statement, find the one-day dip, match your name across documents, or take responsibility. Aira checks real documents in code, and a human signs off."

---

## Slide 3 — Proposed Solution *(Template Page 4)*
- **3-Step Workflow (Zero raw paths):**
  1. **1. Check documents:** Reads uploaded files in memory only. Extracts facts with exact quotes; plain code verifies quotes, masks IDs, checks names, and checks the lowest 28-day bank balance.
  2. **2. Counselor approves:** Clean cases clear in one click. Only flagged exceptions reach the counselor, who issues a single-use approval token.
  3. **3. Agent submits:** Gemini Computer Use fills the university portal and stops before Submit until a valid counselor token unlocks submission.
- **Live Product Visuals:**
  - Left screenshot: **Verdict Card + 3-row 28-day dip table** (`High refusal risk: 1 issue`, `2026-11-04` dip + verbatim quote).
  - Right screenshot: **Green Submission Receipt** (`APP-...`, *"Submitted only after counselor approval."*).

---

## Slide 4 — Solution Architecture *(Template Page 5)*
**Visual Boxes-and-Arrows Diagram (labels only, no library versions):**
- `[Student & Counselor Web App]` → `[Cloud Run: Web & API]` (Memory-only uploads · Plain-code rules · Rate limits · SSRF guard)
- `[Cloud Run: Web & API]` ↔ `[Gemini Models]` (`gemini-4-hydrogen` Extract · `gemini-4-carbon` Audit · `gemini-4-neon` Search + URL Context · `gemini-3.8-flash` Classify)
- `[Cloud Run: Web & API]` → `[Cloud Tasks]` → `[Private Cloud Run: Browser Agent]` (`gemini-4-hydrogen` Computer Use · Plain-code Action Filter · Blocks Common App, UCAS, Payments & Submit)
- `[Private Cloud Run: Browser Agent]` → `[University Portal]` (HTTP 403 Submit Gate verifies single-use token)
- **Shared Cloud Backbone:** `[Firestore]` (Cases, Single-Use Tokens, Audit Log) · `[Secret Manager]` (API Key & Portal Passwords) · `[Cloud Logging]` (Zero PII / Doc Text)

---

## Slide 5 — Google AI Tools *(Template Page 6)*
- **Google AI Studio:** Live Gemini API provisioning, real model discovery, and structured JSON output testing.
- **Google Antigravity:** Parallel multi-agent workflows, defensive-security skills, automated Playwright end-to-end verification, and bespoke illustration generation (Nano Banana / Imagen).
- **Gemini Interactions API & Grounding:** Native browser Computer Use with prompt-injection detection and human confirmation gates, plus Google Search Grounding and URL Context.
- **Google Cloud:** Cloud Run (public web + private agent worker), Cloud Tasks, Firestore, Secret Manager, and Cloud Logging.

---

## Slide 6 — Google AI Models *(Template Page 7)*

| Model (Live) | Fallback | Role in Aira | Why Chosen |
|---|---|---|---|
| **`gemini-4-hydrogen`** | `gemini-3.8-flash` / `gemini-4-carbon` | Document extraction with quotes + Computer-Use portal filling | Strong accuracy on Indian marksheets/bank statements + native computer use |
| **`gemini-4-carbon`** | `gemini-4-argon` | Plain-English fixes, refusal risk score, 3-failure browser escalation | Deep reasoning for multi-document audits and recovering stuck steps |
| **`gemini-4-neon`** | `gemini-4-carbon` | Official university rules via Search Grounding + URL Context | Live official university links without brittle scrapers |
| **`gemini-3.8-flash`** | None | Document classification + 6-digit email verification codes | Fast, low-cost utility steps |

- **Measured Unit Cost:** **~$0.03 per student case** (tracked live per case in the Counselor Queue).

---

## Slide 7 — Live Demo, Business Model & Trust *(Template Page 8)*
- **Top Highlight (Big Text) — Try Live Now:** `https://aira-web-217073132830.asia-south1.run.app`
  1. Click **Try with sample documents** *(catches 1-day UK bank dip)*
  2. Open **2. Approve** → click **Approve & Issue Token** → copy token
  3. Open **3. University portal** → click **Submit** *(blocked: 403)*
  4. Paste token → click **Submit** *(200 receipt)*
- **Business Model:**
  - Students: free document check; ₹7,999 for up to 8 applications, paid only when the file is ready.
  - Universities & agencies: from $40 per verified, quote-backed file, aimed at UK credibility-check budgets *(Salford £250k, Nov 2026; Abertay £225k, Oct 2026)*.
- **Legal & India DPDP Ready:** Never automates Common App or UCAS; students sign visa forms themselves; files deleted immediately from memory; IDs masked; one-click Delete My Data.

---

## Slide 8 — Thank You *(Template Page 9)*
- Official Buildathon Thank You design
- **Team:** AIRA AI · Founder: Arun Reddy · `teamarunreddy@gmail.com`
- **Live Demo:** `https://aira-web-217073132830.asia-south1.run.app`
- **GitHub:** `https://github.com/F1VISABYARUN/GOOGLE-BUILDATHON`
