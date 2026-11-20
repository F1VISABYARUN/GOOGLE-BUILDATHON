# Aira Application Agent — 2-Minute Judge Demo Script

**Live URL:** https://aira-web-217073132830.asia-south1.run.app

---

### 0:00 – 0:25 | Beat 1: DPDP Consent, Upload & Verbatim Quote Audit
1. Open `/` and point out the **Privacy Consent & One-Time Authorisation** screen (files stay in memory only, deleted immediately; passport/account/Aadhaar/PAN masked; under-18 parental consent toggle; typed e-signature).
2. Upload 2 sample documents (sample CAS letter + sample Indian bank statement) for **UK (London)**.
3. Point out the **Results Page**:
   - Every fact shows its **exact verbatim quote** from the document (and Aadhaar/PAN/passport/account numbers are masked to the last 4 digits).
   - **Plain-Code Funds Math** shows exact arithmetic: `CAS Tuition − Deposit Paid = Unpaid Tuition + UK London Living (£1,570 × 9)` using visible, dated exchange rates — never LLM math.
   - Red/Amber flags include plain-English fixes written by `gemini-4-carbon`.

### 0:25 – 0:55 | Beat 2: Grounded University Rules & Live Computer-Use Agent
4. Scroll to **Live University Rules Lookup** (`gemini-4-neon` + Google Search + URL Context) showing live official requirements with clickable university links.
5. Click **Start Application Agent** targeting `/portal`.
6. Explain that `aira-web` dispatches a job via **Google Cloud Tasks** to our private Playwright worker (`aira-agent`) using the **Gemini Interactions API** (`client.interactions.create` on `gemini-4-hydrogen`).
7. Show the **Live Step Feed** (screenshots + actions + model intent): the agent creates the portal account with a Secret Manager password, reads the 6-digit email verification code via `gemini-3.8-flash`, fills Personal Details, handles the custom ARIA dropdown and date picker on Academics, and fills Funding.

### 0:55 – 1:15 | Beat 3: Submit Is Blocked in Code
8. Point out the final amber/red badge in the Live Step Feed: **Paused — Needs Approval**.
9. Explain our two-layer safety lock: the agent's plain-code action filter blocks Submit/Declaration without a counselor token, AND `/portal`'s Submit endpoint enforces **HTTP 403** in Firestore without a valid single-use token.

### 1:15 – 1:40 | Beat 4: Counselor Exception Queue (`/counselor`)
10. Open `/counselor` (protected by `COUNSELOR_PASSCODE` in Secret Manager).
11. Highlight: counselors see **only exceptions** sorted by risk score (0–100), one case per screen, with **Cost Per Case** (tokens, steps, USD) and `A`/`E`/`R`/`J`/`K` shortcuts — while clean green cases are cleared in one click via **Batch Approve**.
12. Press **`A`** (Approve) to issue a **single-use approval token** in Firestore tied to that exact case ID and portal URL, logged in the timestamped Audit Log.

### 1:40 – 2:00 | Beat 5: Application Submitted & Privacy Proof
13. Return to `/portal` (or click **Resume Agent After Approval**): with the counselor's single-use token attached, Submit succeeds with an official receipt (`APP-...`), and any replay attempt returns **HTTP 403**.
14. Point out the **Delete My Data** button on the student page to prove DPDP compliance end-to-end.
