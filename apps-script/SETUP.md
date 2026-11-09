# Gmail Outreach setup

## What is implemented
The existing hunter and its workflow are unchanged. GitHub Actions continues public lead discovery every 30 minutes. A separate test workflow checks the outreach code. A Google Apps Script time trigger pulls the existing public `data/state.json` every 30 minutes into a **private** Sheet. This pull integration needs no webhook, GitHub token, Gmail password, client secret, refresh token or GitHub secret. Gmail OAuth consent and token renewal are managed inside Google's Apps Script runtime.

Code is committed and mock-tested. Live Gmail OAuth, trigger installation, inbox access, draft creation and delivery must be verified after the mailbox owner installs and authorizes the script. Nothing is currently connected to your Gmail by merely committing this code.

## Install (mailbox owner, once)
1. At https://sheets.google.com create a blank **private** spreadsheet, named `Client Hunter Outreach`. Do not share it or its script: editors can access private leads and modify automation code.
2. Extensions → Apps Script. Replace Code.gs with this directory's `Code.gs`.
3. Project Settings → enable “Show appsscript.json manifest file in editor”. Replace the manifest with this directory's `appsscript.json`. Save.
4. Select `setup`, then Run. Choose the Gmail account that will send proposals and approve the requested Google permissions. `setup` creates Leads, Suppression and Ledger tabs, records the mailbox owner and spreadsheet ID in Script Properties, and installs one 30-minute `tick` trigger. Re-running setup replaces only this script's tick triggers. Reload the spreadsheet for the Client Hunter menu.
5. Run `tick` once. If no candidates exist upstream, Leads contains headers only. That is not an installation failure. Apps Script → Executions shows any import/permission failure. The current upstream run had zero candidates; discovery does not guarantee buyers.
6. For a real buyer candidate, verify the original request, date, requested service and permitted contact method. In the PRIVATE Leads row fill `email`, `email_source` (HTTPS evidence showing this recipient is the correct contact), `contact_name` (optional), correct `market` (`India` or `International`) and set `verified` to `YES`. Imported leads are never automatically declared verified; email syntax alone does not verify ownership or deliverability. No email addresses are guessed or scraped from unrelated pages.
7. Client Hunter → Sync and prepare drafts. A verified row receives a personalized Gmail draft. Offer: India ₹999; international $19, starting price for one page. Domain, paid hosting, ecommerce/custom integrations are separate.
8. Review/edit that exact draft in Gmail. Return to its row in the Sheet and choose **Approve selected draft**. This records a hash of recipient, CC/BCC, subject, plain and HTML bodies, and attachments. Do not edit internal state columns manually. Draft changes after approval invalidate approval. Approvals expire after 24 hours.
9. Sending starts paused (`SEND_ENABLED=false`). When ready choose **Enable approved sending**. The next `tick` sends only individually approved drafts, up to 20/day (UTC day). Set a lower `DAILY_CAP` in Script Properties if desired. **Pause sending** immediately stops subsequent automated sends; already accepted messages cannot be recalled.

## Google permissions you approve
| Scope | Used for |
| --- | --- |
| `https://mail.google.com/` | GmailApp draft creation, reading replies, reading approved drafts and sending. This is Google's broad mailbox scope and technically permits deletion; this code does not delete mail. |
| `https://www.googleapis.com/auth/spreadsheets` | Read/write the private Leads, Suppression and Ledger tabs. |
| `https://www.googleapis.com/auth/script.external_request` | Fetch public candidate JSON from this GitHub repository. |
| `https://www.googleapis.com/auth/script.scriptapp` | Install/manage this script's 30-minute trigger. |
| `https://www.googleapis.com/auth/userinfo.email` | Identify the mailbox owner for owner-only approval controls. |

Use only your own reviewed Apps Script project. Do not enter Gmail passwords/app passwords in code, GitHub, Sheets or chat. No Cloud OAuth client setup is needed for this personal Apps Script implementation. Workspace policies may require an administrator or block a permission; do not bypass an organization restriction. If Google refuses authorization, the integration stays inactive.

## Automatic behavior after installation
- Import new candidates without overwriting existing verification, approvals or private fields; duplicate source IDs are ignored.
- Create drafts only for manually verified contacts with an explicit source and confirmed market.
- Persist email-stage reservations before sending. A duplicate email cannot receive another initial send or more than one follow-up through the automation.
- Check the recipient's inbound messages, including separate threads, before sending; retain opt-outs indefinitely in Suppression. STOP, unsubscribe, remove-me and not-interested responses suppress future contact. You can also choose Suppress selected email manually.
- Every inbound reply after the initial send stops follow-ups, including ambiguous/automated replies. Original-thread delivery failures also halt follow-ups.
- Mark likely interest as `interested_candidate`; this is a keyword suggestion requiring your review, never a confirmed sale. No automatic negotiation, reply or payment promise.
- At least 3 days after an initial send, create ONE follow-up draft if there is no reply or opt-out. A separate approval is required to send it. No second follow-up.
- Rotate across private rows (up to 50 eligible email rows / about 4 minutes per invocation). Large queues take multiple ticks. Trigger timing is approximate and Google quotas still apply. Scans with 100 matching threads fail closed for manual review.

The script tracks replies, not opens. It does not use tracking pixels. Reply content stays in Gmail; only classification/timestamp is saved privately. Never put private emails, OAuth material, inbox exports, Sheet IDs or Ledger data in this public repository or public Actions artifacts.

## Recovery and testing
- `sending_uncertain`: Gmail may have accepted a send before a timeout/crash. The Ledger reservation deliberately prevents automatic resend. Check Gmail Sent and the Ledger manually. Do not delete reservations or reset rows casually; that can create duplicate messages.
- A deleted/changed draft or missing scope produces a private row error and no automatic resend. Review the row and recreate/reapprove the draft as appropriate. For reply-classification errors inspect the Gmail conversation yourself.
- The Leads sheet is the control plane; editing internal IDs/status/reservations bypasses invariants. Keep owner-only access and use the menu for approvals/suppression. Manually sending Gmail drafts outside this automation is not tracked as an approved automation send; do not do that with managed drafts.
- Test locally: `node --test tests/outreach.test.cjs`. GitHub Actions runs the same mock tests. Tests do not contact Gmail or send messages.
- After authorization, perform one end-to-end test using a real email address you own: add its source/verification, run tick, inspect draft, approve, enable, run tick, confirm one Sent message and a Ledger `sent` entry. Reply STOP from the recipient; run tick and confirm Suppression and `opted_out`. Repeat with an interested reply on a fresh controlled recipient if desired. Use only owner-controlled recipients for these installation tests.
- To disconnect: Pause sending, delete the `tick` trigger in Apps Script, and revoke the script's access at https://myaccount.google.com/permissions. Keep the private suppression list if you resume later.
