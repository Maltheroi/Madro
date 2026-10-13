# Implementation plan

Status as of 2026-10-12. ✓ done and verified, ◐ partly done, ○ not started.

## Phase 1: Foundation ✓

- ✓ Next.js 16 + TypeScript strict + Tailwind 4 + shadcn-style UI, Danish UI, DKK and metric units
- ✓ Zod-validated server env, setup page when unconfigured
- ✓ Supabase schema (30 tables), RLS on all tables, reference data, generated dev seed
- ✓ Docker-free local stack (Postgres + Supabase Auth + gateway)
- ✓ DB tests for RLS, cascades, append-only prices, rate limiter

## Phase 2: Domain engines ✓

- ✓ Nutrition engine: units, food states, completeness, confidence, rounding
- ✓ Initial targets (Mifflin-St Jeor) with guardrails and Danish explanations
- ✓ Meal planner with hard constraints, scaling, tolerances, locks, seeds
- ✓ Price freshness and effective price rules
- ✓ Basket optimizer (single store, ceil packages, waste, two modes, explanations)
- ✓ Weight trend and adaptive calorie algorithm with guardrails and timeline ranges

## Phase 3: Screens ✓

Landing, log ind, opret konto, glemt/ny adgangskode, onboarding (5 steps), Oversigt, Madplan, Opskrift, Madregistrering, Vægt og mål, Indkøbsliste, Sammenlign butikker, Indtast priser, Spisekammer, Profil, Ernæringsmål, Privatliv og data, Datakilder (admin), privatlivspolitik (draft), not-found and error pages.

## Phase 4: Data providers ◐

- ✓ Provider contracts and registry; admin status page
- ✓ Open Food Facts v3 barcode adapter (parsing tested; needs User-Agent)
- ✓ Manual price entry (private, estimated)
- ○ OFF import job writing to a separate ODbL store, plus barcode lookup UI
- ○ Frida 5.5 import (blocked on DTU licence confirmation)
- ○ ShelfAtlas offers adapter and sync job (blocked on paid key)
- ○ supermarkedspriser item-level adapter (blocked on API agreement)
- ○ Salling Stores and Anti Food Waste adapters (blocked on key and terms review)
- ○ Product ↔ ingredient matching tool for admins

## Phase 5: Production hardening ○

- ○ SMTP for auth mail and a custom domain
- ✓ Repository on GitHub (Maltheroi/Madro) with CI
- ✓ Hosted Supabase project (EU) with schema and seed; Vercel deployment
- ✓ Content-Security-Policy with nonces
- ○ Error monitoring without PII
- ○ Legal review of privacy policy and data-source attributions
- ✓ Accessibility audit (axe, WCAG 2.1 AA) on 17 pages in E2E
- ○ Lighthouse budget
- ○ Replace approximate dev nutrition with Frida values and real recipes

## Later

- Multi-store baskets, store selection by location
- Own recipes and recipe import
- Progress photos (storage bucket and RLS already prepared)
- AI-assisted recipe suggestions using the same validated-candidates pattern
