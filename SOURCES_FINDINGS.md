# Data Source Findings: FBIL & RBI DBIE

This document details the findings from the research and validation of the G-Sec yield data sources (FBIL and RBI DBIE) performed in Stage 1, per Development Roadmap §2.1.

---

## 1. FBIL (Financial Benchmarks India Pvt. Ltd.)
- **URL**: [https://www.fbil.org.in](https://www.fbil.org.in)
- **Publication Schedule**: Daily on all Mumbai business days by 7:00 PM IST.
- **Access Method & Technical Findings**:
  - The website is built as an **Angular Single Page Application (SPA)**. A simple raw HTTP request (such as `curl` or `requests` in Python) only retrieves the blank shell container (`<app-root></app-root>`), meaning data table contents are loaded dynamically via AJAX.
  - There are **no public, unauthenticated, stable REST API endpoints** exposed for programmatic consumption.
  - To download G-Sec par yield curves or valuations:
    1. Users must navigate to the "Benchmarks" or "Valuation" tabs in the UI.
    2. Submit a mandatory contact/validation form (entering Name, Email, Organization, Mobile).
    3. Click the generated download links to retrieve Excel or CSV files.
  - The portal employs **reCAPTCHA protection** and Cloudflare/DDoS protection, which makes automated programmatic scraping from cloud servers (like Render free tier) highly fragile and prone to being blocked.
- **Stability**: High for manual users; Low/Messy for headless programmatic scraping due to CAPTCHA and dynamic Angular bundles.

---

## 2. RBI DBIE (Database on Indian Economy)
- **URL**: [https://dbie.rbi.org.in](https://dbie.rbi.org.in)
- **Access Method & Technical Findings**:
  - DBIE is a data warehouse that organizes statistics into folders and time series.
  - Yields for Government of India dated securities are located under the "Statistics" -> "Financial Market" section.
  - There is **no direct, static, or unauthenticated query endpoint** for daily G-Sec par yield curves.
  - Users must query time series through the query builder, select relevant series (e.g., "Secondary Market Yields of Dated GOI Securities"), execute the query, and manually export the results to Excel/CSV.
  - Navigating the query builder dynamically requires active session cookies, which makes simple Python script integration fragile and unsustainable.
- **Stability**: Stable for manual historical export; Poor for daily programmatic extraction without driving a full headless browser session.

---

## 3. Recommended Approach & Fallback
Since neither FBIL nor RBI DBIE provides a clean, public, unauthenticated REST API, the project will implement:
1. **Fallback Priority**: In Stage 2, the ingestion service (`nightly_ingestion_job.py`) will first attempt to query FBIL/DBIE (or mock endpoints during testing). If both automated channels fail (or are blocked by anti-bot measures), it will trigger the manual fallback path.
2. **Manual CSV Ingestion**: A robust `manual_csv_loader.py` will read a file uploaded by the developer/administrator. This is the most reliable approach for a free-tier portfolio project.
3. **Operational Alerts**: Ingestion failures will log detailed alerts so the administrator knows to download the CSV manually from the FBIL portal and supply it to the loader.

---

## 4. Manual CSV Fallback Structure
To match the `raw_par_yield_observations` table in the database schema exactly, the manual CSV file must use the following format:

```csv
observation_date,tenor_label,tenor_years,par_yield
2026-07-10,91D,0.25,6.8500
2026-07-10,182D,0.50,6.9200
2026-07-10,364D,1.00,7.0100
2026-07-10,2Y,2.00,7.1200
2026-07-10,5Y,5.00,7.2000
2026-07-10,10Y,10.00,7.2800
2026-07-10,15Y,15.00,7.3500
2026-07-10,30Y,30.00,7.4500
2026-07-10,40Y,40.00,7.5200
```

### Column Specifications:
- `observation_date`: The trading day (format: `YYYY-MM-DD`).
- `tenor_label`: The tenor name as published (e.g., `91D`, `1Y`, `10Y`).
- `tenor_years`: The decimal fraction of the tenor in years (e.g., `0.25` for 91D, `0.5` for 182D, `10.0` for 10Y).
- `par_yield`: The yield value as published in percent (e.g., `7.2800` for 7.28%).

---

## 5. Verification: What a Human Needs to Verify Manually
1. **Verification of Live File Layout**: Log in to the [FBIL website](https://www.fbil.org.in), navigate to G-Sec par yield curve download, fill in the form, and download the daily CSV. Verify if the column headers match the standard layout (`ISIN`, `Coupon`, `Maturity`, `Price`, `YTM` for valuations, or `Tenor`, `Yield` for the par yield curve).
2. **Access Verification**: Verify if FBIL's network has changed to block public downloads without user account login, or if the guest form remains active.
