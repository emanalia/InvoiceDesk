# InvoiceDesk — Paper to Pipeline
### Fastn Hackathon | Dual-AI Invoice Verification & Fraud Shield

**From invoice documents to explainable financial review decisions.**

InvoiceDesk is a standalone hackathon prototype for automated invoice processing, dual-LLM verification, deterministic financial and fraud-rule checks, and Fastn-powered business integrations.

It combines custom-built OCR and invoice field extraction, two integrated AI model providers, mathematical validation, risk indicators, and a review-oriented dashboard to help identify suspicious invoices before payment approval.

> **Core idea:** AI-assisted analysis, deterministic financial rules, and connected business workflows working together — with human review for flagged invoices.

---

## The Problem

Invoice processing involves more than reading a document. Incorrect totals, suspicious payment instructions, unverified vendor information, and urgent payment requests can expose businesses to financial loss.

InvoiceDesk brings these checks into a single workflow, helping teams inspect extracted invoice data, identify inconsistencies, and review the evidence behind a decision.

## Key Features

### 1. Custom-Built OCR and Invoice Extraction
InvoiceDesk accepts uploaded invoice PDFs and extracts structured information for downstream verification, including invoice numbers, vendor details, dates, tax identifiers, and financial values.

The OCR and extraction pipeline is part of the project implementation, rather than merely a static invoice display.

### 2. Dual-LLM Verification

Two model integrations support complementary stages of invoice processing:

- **Model A — Extractor:** Google Gemini (`gemini-1.5-flash`), accessed through Google AI Studio. The configured architecture also supports OpenAI `gpt-4o-mini` as a fallback.
- **Model B — Auditor and Risk Analyst:** OpenRouter, using `meta-llama/llama-3.3-70b-instruct` or the configured model. The configured architecture also supports Anthropic `claude-3-haiku` as a fallback.

Heuristic extraction and auditing modes support local/demo operation when live inference is unavailable.

### 3. Arbitration and Consensus Engine
The architecture includes field-level mathematical comparisons, fuzzy differences, and confidence scoring to help identify disagreements between extracted values and verification results.

### 4. Deterministic 8-Point Financial and Fraud Shield
A rule-based verification layer evaluates financial and compliance signals independently of probabilistic model output.

The intended checks cover invoice arithmetic, tax and vendor information, suspicious payment instructions, bank-account changes, and other risk indicators configured in the verification engine.

**Why this matters:** an AI model's approval should not override a deterministic mathematical discrepancy.

### 5. Invoice Review Dashboard
The interface provides:

- Tenant selection
- Invoice status and risk summaries
- Uploaded-document details and extracted fields
- Line-item breakdowns
- Dual-AI analysis
- Eight-point verification results
- OCR text and audit-trail views
- Review actions for flagged invoices

### 6. Fastn Connector Infrastructure
The application is configured around five business connector integrations:

| Connector | Intended role | Workflow target |
|---|---|---|
| Gmail | Inbound invoice ingestion | `Fastn_Gmail_Invoice_Ingest` |
| Google Drive | Watched-folder invoice ingestion | `Fastn_GDrive_Folder_Watcher` |
| Google Sheets | Approved-item ledger updates | `Fastn_GSheets_Ledger_Append` |
| Slack | Fraud alerts and approval notifications | `Fastn_Slack_Finance_Alerts` |
| HubSpot | Vendor identity and tax-ID validation | `Fastn_HubSpot_Vendor_Verify` |

Live Fastn connection discovery and read-only health checks have been executed successfully for the configured Gmail, Google Drive, Slack, and HubSpot connections. The project also includes Google Sheets in its intended connector architecture.

Connection health does not, by itself, establish that every inbound trigger, outbound write, or vendor-validation workflow has been tested end to end.

---

## Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| Backend | Node.js, Express, TypeScript |
| Storage | SQLite using `better-sqlite3` |
| Model A | Google Gemini via Google AI Studio |
| Model B | OpenRouter with a configurable model |
| Arbitration | Field-level comparison, fuzzy diffing, confidence scoring |
| Financial validation | Deterministic eight-point rule engine |
| Integrations | Fastn connector infrastructure |

### Architecture Overview

```text
Invoice PDF
    |
    v
Upload & Ingestion
    |
    v
Custom OCR & Field Extraction
    |
    +---------------------------+
    |                           |
    v                           v
Deterministic Rule Checks   Dual-LLM Analysis
    |                           |
    +-------------+-------------+
                  |
                  v
        Arbitration & Risk Review
                  |
                  v
       Invoice Status & Dashboard
                  |
                  v
       Fastn-Connected Workflows
```

The diagram represents the intended processing architecture. Actual execution of each stage depends on its configuration and should be confirmed through the corresponding analysis and audit results.

---

## Quick Start

### 1. Prerequisites

- Node.js 18 or later
- npm

### 2. Install dependencies

From the project root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 3. Configure environment variables

Use the supplied `.env.example` as the configuration reference and configure the backend environment.

```bash
cd backend
```

Create `backend/.env` using the appropriate values from the example file.

```env
# Fastn integration — server-side only
FASTN_API_KEY=

# Google AI Studio / Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
```

Additional variables may be required by the configured application and fallback providers.

**Security:** never commit `backend/.env`, API keys, OAuth tokens, or secret-bearing endpoint URLs. Keep real credentials on the server.

### 4. Initialize demo data

```bash
cd backend
npm run seed
```

The seed configuration defines two isolated tenants:

- **Acme Corp** — USD, `en-US`, 10% tax
- **EuroTech GmbH** — EUR, `de-DE`, 19% tax

Each tenant is designed to include three representative scenarios:

1. `INV-2024-001` — clean invoice with matching arithmetic
2. `INV-2024-002` — mathematical discrepancy requiring review
3. `INV-2024-003` — high-risk bank-change and payment indicators

The seed scenarios are intended demo data; verify their actual statuses in the running application.

### 5. Run the application

**Terminal 1 — Backend**

```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend**

```bash
cd frontend
npm run dev
```

Open the local frontend URL printed by Vite, normally `http://localhost:5173`. The backend in the current development setup runs at `http://localhost:3001`.

---

## Testing & Verification

### Backend build

```bash
cd backend
npm run build
```

The backend TypeScript build has passed in the current development environment.

### Fastn live smoke test

```bash
cd backend
npx ts-node .\src\fastnLiveSmoke.ts
```

The live smoke test has successfully discovered five Fastn connections, reported five as active, and passed read-only health checks for Gmail, Google Drive, Slack, and HubSpot.

This validates the tested connection and health-check paths. It does not prove that every connector action, the Google Sheets write path, or all invoice-triggered workflows are operational.

### Automated tests

The project includes a backend test runner covering areas such as tenant isolation, arbitration, deterministic verification, approval workflows, and Fastn-related security.

Run the test command actually configured in `backend/package.json`. Do not assume that a specific test count or `npm test` script is available without confirming it in the current checkout.

---

## Demonstrated End-to-End Behavior

During the current development session, the following behavior was observed:

- Frontend and backend started successfully.
- The backend build passed.
- Fastn connection discovery and configured read-only health checks passed.
- A fictional PDF invoice was uploaded through the application.
- The uploaded document was associated with its invoice record.
- Structured fields such as invoice number, vendor, dates, tax ID, subtotal, tax, and total were displayed.
- The uploaded discrepancy test invoice received a `NEEDS REVIEW` status.

### Example: Mathematical Discrepancy

The fictional test invoice contains:

| Field | Amount |
|---|---:|
| Line-item total | $3,200.00 |
| Stated subtotal | $3,500.00 |
| Difference | $300.00 |
| Expected handling | Needs review |

The intended behavior is to surface the discrepancy and route the invoice for review instead of allowing a model's plausibility judgment to bypass the financial rule.

The actual Dual-AI Analysis, eight-point results, and audit-trail output should be inspected to confirm that both model integrations and the relevant checks executed for this specific upload.

---

## Security & Tenant Isolation

The project architecture includes:

- **Server-side tenant scoping:** database operations are designed to restrict records using tenant identifiers.
- **Cross-tenant protection:** the documented design calls for unauthorized cross-tenant document or audit requests to return `404 Not Found`.
- **Credential isolation:** Fastn and AI-provider credentials belong on the backend, not in browser-delivered code.
- **Connector honesty:** an unauthenticated connector should not be represented as having successfully executed a workflow.
- **Human review:** flagged invoices are presented for inspection rather than treating model output as definitive proof of fraud.

These are implementation requirements and design claims; security tests should be run before representing every property