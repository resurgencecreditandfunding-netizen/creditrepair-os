# Leverage IQ

Free credit repair that leads into business funding. Phase 1: onboarding and signing, report audit, dispute rounds, funding gate.

## Run

```bash
npm install
npm run dev:demo
```

Open http://localhost:3000 for the client side and http://localhost:3000/console for staff (demo login: `admin@demo.local` / `demo-console`). Demo mode adds a sample report, a simulated report refresh, and skips the waiting period. Never set `DEMO_MODE=1` in production.

```bash
npm test
```

## Deploy (Render)

`render.yaml` is a Render Blueprint: New > Blueprint > pick this repository. It creates the web service with a 1 GB disk for the database and asks for the secret values. Changes merged into `main` deploy automatically. Health check: `/api/health`.

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `BRAND_NAME` | Product name clients see. Defaults to Leverage IQ. |
| `LEGAL_NAME`, `BRAND_ADDRESS` | Contracting company and its principal address, printed in the contract. Defaults to Resurgence Consulting Services Incorporated; the address is required by law before launch. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Creates the first platform-owner console login on first start. |
| `SESSION_SECRET` | Signs the session cookie. Required in production. |
| `ANTHROPIC_API_KEY` | Required for real use. Reads uploaded reports (PDF or saved HTML) and rewords letters. Without it, only the demo report and JSON uploads work. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Operator subscription. The webhook endpoint is `/api/stripe/webhook`; send it `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. |
| `RESEND_API_KEY`, `NOTIFY_FROM` | Email sign-up alerts through Resend. The sending domain must be verified in Resend. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Text sign-up alerts through Twilio. |
| `APP_URL` | Public address of the site, used for Stripe return links. |
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
| `src/lib/console.ts` | Staff logins, companies, the work queue, and the rule that staff see only their own company's clients. |
| `src/lib/ai.ts` | Claude: reads PDFs and rewords letters. It cannot add or drop a fact. |

## Operator console (`/console`)

- Platform owner: sees every company and client, adds companies and staff logins.
- Company admin or staff: sees only that company's clients.
- Work queue: letters the client approved and are ready to mail, overdue bureau responses, clients ready for the next round, funding requests.
- Staff can upload reports, draft letters, record mailing and results, and add internal notes. Staff can never approve a letter for a client.
- Each company's clients sign a contract naming that company's legal name and address.

## Owner's business page (`/console/admin`)

Platform owner only, and where the owner lands after sign-in. Shows estimated monthly revenue, operators by payment status, clients and results across every company, open funding requests, credit monitoring link clicks, and latest activity. The owner can suspend or reinstate a company, give free access, and edit a company's contract details. Owners and company admins can reset a staff password or remove a login under Companies and logins.

## Client journey, freeze step and alerts

- The client dashboard shows a 13-step journey map under the scores: done, current (with its action), next and remaining steps. Staff see the same map, without actions, on the client's file.
- Letters cannot be prepared until the client has reviewed their report and completed the secondary bureau freeze step: each listed bureau marked frozen or skipped. The platform owner edits the bureau list under Companies and logins. The funding request asks the client to confirm they have lifted their freezes.
- Sign-up alerts go by email and/or text when a client signs: to that client's company, and to the owner (all companies or only direct clients, the owner's choice). The owner is also alerted when a company registers and when it starts paying. Each company sets its alert email and mobile under Companies and logins. Alerts run in the background; a failed alert is logged and never blocks a sign-up.

## Operator subscription

Companies sign up at `/console/signup`, pay through Stripe Checkout, and get console access when Stripe confirms payment. Access continues while a late payment is retried and closes on cancellation; their existing clients keep their own accounts. Companies the platform owner adds by hand are not charged.

## How the work is divided

The client does the work: signs up for credit monitoring through a partner link, uploads the report, approves each letter, prints and mails it, and records the tracking number and results. The platform audits the report, decides the round, writes the letters, and tracks deadlines. Staff oversee from the console.

Credit monitoring partners are the platform owner's affiliate links, managed under Companies and logins. Every client at every company sees them, with a commission disclosure, and each click is recorded.

## Not built yet

- Per-company fee terms in the client contract (every contract currently says $0).
- Client login. A signed cookie identifies the device; add email or SMS login before real customers.
- Self-service "forgot password" and two-step sign-in for staff. An admin resets passwords by hand.
- Lender matching (Phase 2).
- State eligibility rules, and attorney review of every document and citation.
