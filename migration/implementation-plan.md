# Implementation Plan

## Phase 0: Keep Current Apps Script Stable

- Freeze functional scope in the Apps Script version.
- Keep it available as fallback until the new app survives one full rehearsal.
- Do not add new performance work to Apps Script except critical bug fixes.

## Phase 1: New App Skeleton

- Create `web/` Next.js app.
- Add Supabase server client.
- Add environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ADMIN_SESSION_SECRET`
  - `EVENT_CODE`
- Add pages:
  - `/` customer order
  - `/pickup`
  - `/admin`

## Phase 2: Database

- Create Supabase project.
- Apply `migration/schema.sql`.
- Seed:
  - one event
  - `yeongju`, `jeju` teams
  - menus
  - master/team admin PIN hashes
  - bank/QR settings

## Phase 3: Customer Flow

- Implement `GET /api/public/bootstrap`.
- Implement `POST /api/orders`.
- Implement `POST /api/orders/:orderId/payment-checking`.
- Implement `GET /api/pickup/orders/:orderId`.
- Keep local-first pickup rendering for immediate feedback.
- Add realtime subscription to the current order sections.

## Phase 4: Admin Flow

- Implement PIN login with signed HTTP-only cookie.
- Implement team-scoped order list.
- Implement status transitions.
- Implement menu availability toggle.
- Add realtime subscription for admin order board.

## Phase 5: Export And Rehearsal

- Add CSV export endpoint.
- Optionally add Google Sheets export job.
- Run rehearsal with 20-50 mock orders.
- Verify:
  - duplicate order number prevention
  - same order split by team
  - team admins cannot update other team sections
  - customer pickup updates immediately after admin status change
  - menu sold-out updates customer screen

## Phase 6: Cutover

- Make new web app production URL.
- Generate QR from production customer URL.
- Keep Apps Script URL private as fallback.
- During first live hour, watch:
  - API p95 latency
  - failed order creation count
  - realtime disconnects
  - admin status update errors

## Data Migration From Existing Sheet

For rehearsal only:

- Import `Menus` into `teams` and `menus`.
- Import `Orders` into:
  - `orders` grouped by `orderId`
  - `order_sections` per sheet row/team
  - `order_items` parsed from `itemsJson`

For production day:

- Prefer fresh DB with clean counters.
- Do not migrate old test orders unless needed.

## Rollback

If new app fails before public QR distribution:

- Use Apps Script deployment URL.

If new app fails after QR distribution:

- Point QR landing page or short URL to Apps Script URL.
- Export already-created Supabase orders to CSV/Sheet for manual reconciliation.

