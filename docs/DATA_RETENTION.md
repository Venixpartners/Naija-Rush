# Data retention (draft for legal review)

| Data | Kept | Notes |
| --- | --- | --- |
| Guest session (hashed token) | Until 12 months of inactivity | No personal data |
| Raw tap logs (`score_submissions.payload`) | 90 days | Audit of disputed scores; purge job is a Phase 5 task |
| Runs, scores, challenges | Life of the service | Nickname cleared on request |
| Referral clicks and analytics events | 13 months | Aggregates kept after |
| Rate limit counters | Rolling window | Hashed keys only |

Nothing here is final until reviewed against the Nigeria Data Protection Act 2023.
