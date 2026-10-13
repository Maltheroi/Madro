# Security and privacy

Weight, body measurements and food logs are health data (GDPR art. 9). The app is built so that each user can only reach their own data, and so that they can export or delete it themselves.

## Secrets

- `src/lib/env.ts` validates the server environment with Zod at first use. Missing configuration sends users to `/opsaetning` instead of crashing.
- Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` reach the browser. `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` and provider keys are server-only; modules that read them import `server-only`.
- `.env*` files are git-ignored except `.env.example`.

## Authentication and authorisation

- Supabase Auth with email and password (min. 10 characters with upper, lower and digit; email confirmation on). Sessions are refreshed in `src/proxy.ts` and verified server-side with `getClaims()`.
- Every protected page and server action calls `requireUser()`. The user id comes only from the verified session; ids in forms are treated as untrusted and checked against ownership.
- Database queries run as the `authenticated` role with the user's claims (`withUser`), so Postgres RLS applies to everything, and queries also filter on `user_id`.
- RLS is enabled on every public table (a DB test fails otherwise). Highlights:
  - personal tables: owner-only policies; child rows require an owned parent;
  - catalogue (ingredients, recipes, products, prices): read-only for users;
  - user-entered prices: visible only to the reporter; users cannot insert provider prices;
  - calorie recommendations: users may only change `status` and `decided_at` (column grants);
  - `app_admins` cannot be self-granted; `/admin/datakilder` returns not-found for non-admins;
  - the `anon` role has no table access.
- Redirect targets after login are restricted to same-site paths (`safeNext`).

## Abuse protection

- `consume_rate_limit()` (security definer, fixed window per user and action) limits plan generation (30/h), basket calculation (60/h), data export (5/h), calorie evaluations (20/h) and AI calls (20/h).
- Supabase Auth applies its own rate limits to sign-up, login and password reset.
- Price observations are append-only (trigger), so history cannot be rewritten.

## HTTP

Security headers in `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS. `X-Powered-By` is off.

`src/proxy.ts` sets a Content-Security-Policy with a fresh nonce per request: scripts only with the nonce (`'strict-dynamic'`), `connect-src 'self'` (the browser never calls Supabase directly), `frame-ancestors 'none'`, `object-src 'none'`. Inline style attributes are allowed because Radix and Recharts use them. All pages render dynamically so the nonce can be applied. An E2E test checks the header and that no CSP violations occur.

## Logging

`src/lib/observability/log.ts` writes structured JSON events with codes only: no emails, names, weights or food descriptions.

## User rights (GDPR)

- **Access and portability:** `/profil/privatliv` → "Download mine data" (`/api/eksport`) returns every personal table as JSON.
- **Erasure:** "Slet min konto" deletes the auth user via the Supabase admin API; all personal rows cascade from `auth.users` (covered by a DB test and an E2E test).
- **Rectification:** all personal data can be edited or deleted in the app.
- **Consent:** sign-up requires accepting the privacy policy, which explicitly covers health data.
- `src/app/privatlivspolitik` is a **draft** and needs legal review before launch (data controller identity, processors such as Supabase and an AI provider, hosting region, retention).

## AI

AI is off unless `ANTHROPIC_API_KEY` is set. It can only re-rank substitution candidates that code has already filtered for allergens and diet; it never supplies nutrition values or prices. Output is validated with Zod and against the candidate list; anything invalid falls back to the deterministic result. Only ingredient names and categories are sent, never user identity.

## Before production

- Supabase project in an EU region, with point-in-time recovery.
- Review the privacy policy and a DPA with each processor.
- Configure SMTP for auth emails and set the site URL and redirect URLs in Supabase.
- Add error monitoring without PII and a dependency audit in CI.

## Installable app (PWA)

`src/app/manifest.ts` and `public/sw.js` make the site installable on phones. The service worker only caches an offline page and one icon; it never caches pages or API responses, so personal data is not stored on the device by the app. The CSP allows `worker-src 'self'` and `manifest-src 'self'`.
