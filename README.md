# Worldwide Website Client Hunter

Public buyer-request discovery with no paid API or AI key. India: **₹999 starting price**. International: **$19 starting price**.

## Automation
GitHub Actions runs every 30 minutes at :07 and :37 UTC (:07 and :37 IST), and supports Run workflow. Scheduled jobs can be delayed by GitHub; this is not an exact timer. Public-repository scheduled workflows may be disabled after 60 days of inactivity. No guarantee of customers or a fixed lead count.

## Results
- `data/leads.csv`: cumulative candidates and proposal drafts
- `data/latest-proposals.md`: new drafts from the latest successful run
- `data/state.json`: persistent URL and normalized-title duplicate filtering
- `data/summary.json`: counts, feed failures and last run
- Actions run summary and downloadable report artifact

Sources: public Reddit buyer-request search RSS and Bing News RSS. Feeds can block requests or return no matching requests; partial failures are reported. All-feed failure fails the workflow rather than pretending discovery succeeded. These are candidates requiring review, not verified paying customers. India detection uses explicit text clues; verify country and quote before sending.

## Offer
One-page, mobile-friendly business website from ₹999 / $19. Domain, paid hosting, ecommerce and custom integrations cost extra and require an agreed scope. No delivery promises are made automatically.

## Outreach
Personalized proposal drafts are generated, **never posted or sent automatically**. Review relevance, request date, country, community rules and the buyer's preferred contact method first.

## Running
Open Actions → Worldwide Website Client Hunter → Run workflow. No secrets required. Workflow requests contents:write to persist deduplication state. Outputs are public because this repository is public; avoid adding private customer information. Run locally with Python 3.12: `python scripts/hunter.py`.

## Gmail outreach (optional, private)
The additive Gmail integration is in [apps-script/SETUP.md](apps-script/SETUP.md). It uses Google-managed OAuth, a private Sheet, automatic sending for verified contacts (optional manual approval mode), reply/interest classification, permanent opt-out suppression, per-email duplicate prevention and one automatic follow-up after three days without a reply. Any reply stops automated outreach; you answer manually. New installations default to automatic mode. The Apps Script pulls this repository's existing discovery output; no Gmail credentials or private email data go into GitHub. Install/authorize in your Google account before any live Gmail functionality is active. Existing discovery remains unchanged.
