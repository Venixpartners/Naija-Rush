# Integrations: verified capability and status

Checked 17 Oct 2026 against official documentation. Recheck before launch; platform rules change.

| Channel | What ships today | Needs approval? | Clickable link? |
| --- | --- | --- | --- |
| WhatsApp | `wa.me/?text=` with an editable prefilled message, plus native share. Link previews come from our Open Graph tags. | No | Yes |
| Instagram | Story card download or native share sheet with the image, link copied to clipboard, in app guide to use the Story link sticker, bio or DM. | Direct publishing would need the Instagram Graph API with a business or creator account and app review. Not built. | Story link sticker, bio, DM. Not feed captions. |
| TikTok | Story card download or native share, caption with hashtags and link copied, guide to use bio link or DM. A vertical video clip of the run is offered too. | Content Posting API requires an audit; unaudited apps can only post privately for up to 5 users a day, and the consent UI rules are strict. Not built. | Not in captions. Bio link where eligible, DMs. |
| Snapchat | Creative Kit for Web share button (loads `sdk.snapkit.com/js/v1/create.js`), plus image download and native share fallback. | No registration needed for the web button. An optional Snap Kit app ID only adds metrics. | Yes, the shared URL is attached. |
| Native share | Web Share API with the story card image when the device supports file sharing, otherwise link and text. | No | Depends on target app |

Attribution: every shared link carries `?s=` (wa, ig, tt, sc, nt, cp, x). Arrivals are logged in `naijarush.referral_clicks`, with link preview crawlers marked as bots and excluded from metrics. Share sheet opens, target selections and hand offs are intent events only. Nothing is counted as published, because no platform API confirms publication in Phase 1.

Not yet configured: Paystack (Phase 4), ad network (Phase 4), video storage and rendering (Phase 3), PostHog (events are already captured first party in `naijarush.analytics_events`).

Sources: developers.snap.com/snap-kit/creative-kit/web, developers.tiktok.com/doc/content-sharing-guidelines, developers.facebook.com/products/sharing-to-stories.
