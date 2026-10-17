# Data retention (draft for legal review)

| Data | Kept | Notes |
| --- | --- | --- |
| Guest session (hashed token) | Until 12 months of inactivity, if it has no runs and no account | No personal data. Guests with runs are kept with their runs |
| Raw tap logs (`score_submissions.payload`) | 90 days | Audit of disputed scores; cleared daily by `/api/cron/retention` |
| Runs, scores, challenges | Life of the service | Nickname cleared on request |
| Referral clicks and analytics events | 13 months | Deleted daily once past 13 months |
| Rate limit counters | Rolling window | Hashed keys only |

Nothing here is final until reviewed against the Nigeria Data Protection Act 2023.

The job runs daily at 02:17 UTC from Vercel Cron (`apps/web/vercel.json`), works in batches, also removes expired sign in links and rate limit rows, and writes a `retention.run` entry to the admin audit log with counts.
