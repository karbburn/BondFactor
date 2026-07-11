# Supabase Project Setup Instructions

This document provides step-by-step instructions to set up the Supabase project manually for BondFactor, as described in Deployment Guide §2.

---

## 1. Project Creation
1. Go to the [Supabase Dashboard](https://supabase.com/) and log in (or sign up for a free tier account).
2. Click on **New project** and select/create an organization.
3. Fill in the project details:
   - **Name**: `BondFactor` (or your preferred name)
   - **Database Password**: Generate a secure password and save it in a safe place.
   - **Region**: Select a region close to your target users (e.g., `South Asia (Mumbai)` for IST).
   - **Pricing Plan**: Select the **Free Tier**.
4. Click **Create new project** and wait a few minutes for the database and services to provision.

---

## 2. Obtain Project Credentials & Keys
Once provisioned, go to **Project Settings** -> **API** in the sidebar. Note down the following variables to place in your environment files:
- **Project URL**: Found under "Project URL" (e.g., `https://your-project-id.supabase.co`).
  - To be used as `SUPABASE_URL` (Backend) and `NEXT_PUBLIC_SUPABASE_URL` (Frontend).
- **anon / public Key**: Found under "Project API keys" (e.g., `eyJhbGciOi...`).
  - To be used as `SUPABASE_ANON_KEY` (Backend) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Frontend).
- **service_role / secret Key**: Found under "Project API keys" (e.g., `eyJhbGciOi...`).
  - **WARNING**: Do not expose this key client-side. Keep it safe.
  - To be used as `SUPABASE_SERVICE_ROLE_KEY` (Backend only).

---

## 3. Database Migrations (To be run in Stage 2/13)
To initialize the tables, run the SQL migrations from the `04_Database_Schema_BondFactor.md` document:
1. Go to **SQL Editor** in the Supabase sidebar.
2. Click **New Query**.
3. Apply the Phase 1 schema SQL scripts first (e.g., `raw_par_yield_observations`, `curve_calibrations`, `reference_zero_curves`, `active_securities`).
4. Apply the Phase 2 schema SQL scripts (e.g., `portfolios`, `portfolio_positions`, `saved_scenarios`, `report_generations`) when entering Phase 2.

---

## 4. Enable Row Level Security (RLS)
Per Database Schema §6, enable Row Level Security on the user-owned data tables before the Phase 2 auth features go live. Run these in the SQL Editor:
1. Enable RLS:
   ```sql
   ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
   ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE saved_scenarios ENABLE ROW LEVEL SECURITY;
   ALTER TABLE report_generations ENABLE ROW LEVEL SECURITY;
   ```
2. Set up RLS policies so that users can only read/write their own records matching their authenticated user ID (`auth.uid()`).

---

## 5. Enable Supabase Auth
By default, Email/Password authentication is enabled:
1. Navigate to **Authentication** -> **Providers** -> **Email**.
2. Ensure **Enable Email provider** is turned ON.
3. Confirm if **Confirm email** is desired. (Disable it for quick development/testing, or keep it enabled for production).

---

## 6. Supabase Storage Setup (Phase 2 Reports)
If PDF/Excel reports are stored in Supabase Storage:
1. Go to **Storage** in the sidebar.
2. Click **New bucket** and name it `reports`.
3. Set the bucket to **Private**.
4. Configure RLS access rules for the bucket so that a user can only access folders or files matching their own UUID (`auth.uid()`).
