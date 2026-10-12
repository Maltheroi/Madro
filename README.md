# Madro

Danish nutrition and grocery app: personal calorie and macro targets, a 7-day meal plan that respects allergies, food logging, weight trend with an adaptive calorie target, and a shopping list priced per store.

**Status:** working end to end against a local Supabase stack with development data. Prices in the dev seed are synthetic and labelled as such; no live Danish price source is connected yet (see `docs/DATA_SOURCES.md`).

- Architecture: `docs/ARCHITECTURE.md`
- Data sources and licences: `docs/DATA_SOURCES.md`
- Security and privacy: `docs/SECURITY_AND_PRIVACY.md`
- Local development: `docs/LOCAL_DEVELOPMENT.md`
- Plan and status: `docs/IMPLEMENTATION_PLAN.md`

```bash
npm ci
cp .env.example .env.local   # or run scripts/local-stack/start.sh
npm run dev
```
