# Credit and Funding OS

Free credit repair that leads into business funding. Phase 1: onboarding and signing, report audit, dispute rounds, funding gate.

## Run

```bash
npm install
npm run dev:demo
```

Open http://localhost:3000. Demo mode adds a sample report, a simulated report refresh, and skips the waiting period. Never set `DEMO_MODE=1` in production.

```bash
npm test
```

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `BRAND_NAME`, `BRAND_ADDRESS` | Company name and principal address printed in the contract. Required by law before launch. |
| `SESSION_SECRET` | Signs the session cookie. Required in production. |
| `ANTHROPIC_API_KEY` | Turns on AI: PDF report reading and letter rewording. |
| `DATABASE_PATH` | SQLite file. Defaults to `data/app.db`. |

## Where things live

| File | What it decides |
|---|---|
| `src/lib/audit.ts` | What may be disputed. Fixed rules; each finding carries its fact and citation. |
| `src/lib/rounds.ts` | Which round comes next, and the response deadlines. |
| `src/lib/letters.ts` | Letter text, built only from recorded findings. |
| `src/lib/law.ts` | Every citation and bureau address, in one file for attorney review. |
| `src/lib/documents.ts` | The disclosure, contract, cancellation notice, authorization and funding disclosure. |
| `src/lib/funding.ts` | When funding opens (`FUNDING_RULES`). |
| `src/lib/store.ts` | Compliance gates: disclosure before contract, waiting period, approval before mailing, activity record. |
| `src/lib/ai.ts` | Claude: reads PDFs and rewords letters. It cannot add or drop a fact. |

## Not built yet

- Live credit report connection (reports are uploaded as JSON, or PDF with AI).
- Automated certified mail (letters are printed; tracking is typed in).
- Login. A signed cookie identifies the device; add email or SMS login before real customers.
- Operator console for credit repair firms and tax professionals (tenants exist in the database; `/?t=slug` selects one).
- Lender matching (Phase 2).
- State eligibility rules, and attorney review of every document and citation.
