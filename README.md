# JOBINRWANDA.COM

Rwandan employment, procurement tenders, CV builder, and career development platform built with **Kinyarwanda** as the primary language alongside **English** and **Français**.

## Feature Implementation Status

### Implemented & Tested
- **Multilingual UI (RW / EN / FR)**: Full translation switcher (`src/i18n/translations.ts`) with Kinyarwanda default.
- **Job Board & Opportunities (`JobBoardView.tsx`)**: Search, 30 Rwandan districts filter, 10 industry categories, listing type tabs (Jobs, Tenders, Scholarships, Training), employment types, featured listings, saved jobs, job alerts, application submission, and fraud reporting.
- **Candidate Portal (`CandidatePortalView.tsx`)**: Professional profile, education/experience/skills/certifications management, application history & live status tracking, saved vacancies, and job alerts.
- **CV Builder (`CvBuilderView.tsx`)**: 3 templates (`Executive`, `Modern`, `Minimal`), TXT/PDF/DOCX text import, printable PDF export, CV version history, and ethical Gemini AI writing improvement.
- **AI Job Match (`AiJobMatchView.tsx`)**: Server-side `@google/genai` (`gemini-4-hydrogen`) ATS compatibility scoring, missing keywords, skills gap analysis, honest non-fabricated recommendations, cover letter generator, and interview prep.
- **Employer Portal (`EmployerPortalView.tsx`)**: Company registration & verification workflow, job & tender posting, applicant filtering, shortlisting, interview scheduling, and recruitment conversion metrics.
- **Admin, Finance & Moderation (`AdminDashboardView.tsx`)**: RBAC role management, account suspension, company verification, job moderation, configurable pricing packages, MTN MoMo reconciliation & refund workflow, fraud report triage, and immutable audit logs.
- **Real-Time Updates (`server.ts` + `AppContext.tsx`)**: Firestore `onSnapshot` listeners combined with a WebSocket server (`/ws`) on port 3000 for live vacancy, application, and payment notifications.
- **Legal & Privacy (`LegalComplianceView.tsx`)**: Rwanda Law N° 058/2021 consent management, JSON data export, data deletion requests, and Law N° 66/2018 fair recruitment terms (with independent legal review disclaimer).

### Implemented — Awaiting External Merchant Credentials
- **MTN MoMo Rwanda Open API (`server.ts` + `PricingMomoView.tsx`)**: Configured for merchant MSISDN `0795547233`. Implements OAuth token acquisition, UUID `X-Reference-Id`, `202 Accepted` pending state (never activates services on 202), server-side status polling, HMAC-SHA256 webhook verification with replay protection, and sandbox simulation fallback until `MTN_MOMO_SUBSCRIPTION_KEY`, `MTN_MOMO_API_USER`, and `MTN_MOMO_API_KEY` are provisioned.

### Deployment Reference Artifacts Included
- `supabase/migrations/001_initial_schema.sql`: Normalized PostgreSQL schema with Row-Level Security (RLS) policies and indexes for external Supabase/Vercel deployments.

## Running Tests & Verification

```bash
# TypeScript check
npm run lint

# Automated unit & security tests
npx tsx tests/platform.test.ts

# Production build
npm run build
```

## Production Deployment Guide

1. **Environment Variables**: Copy `.env.example` and configure `GEMINI_API_KEY`, `APP_URL`, and MTN MoMo credentials (`MTN_MOMO_SUBSCRIPTION_KEY`, `MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY`, `MTN_MOMO_CALLBACK_SECRET`, `MTN_MOMO_TARGET_ENV="production"`).
2. **Database & Security Rules**: Deploy `firestore.rules` (or apply `supabase/migrations/001_initial_schema.sql` for PostgreSQL/Supabase setups).
3. **Build & Run**: Execute `npm run build` followed by `npx tsx server.ts` (or deploy behind Cloud Run / Node hosting on port 3000).
