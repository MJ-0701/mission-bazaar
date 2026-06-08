# Domain Rules

## Teams

- Current teams:
  - `yeongju`: 영주팀
  - `jeju`: 제주팀
- Teams have separate menus.
- Teams operate separate cooking/fulfillment sections.
- The same customer order can include items from both teams.

## Order Number

- One order number per customer checkout.
- Format: `A001`, `A002`, ...
- Team sections share the same order number.

## Customer Identity

- Required fields:
  - `pickupName`
  - `phone`
- Customer key:
  - trim and remove whitespace from `pickupName`
  - lower-case name
  - strip non-digits from `phone`
  - join as `name:phoneDigits`

## Payment

- One shared bank account.
- Customer transfers manually.
- Customer must include order number and pickup name in transfer memo where possible.
- System does not perform bank reconciliation.

## Status Unit

Status lives on `order_sections`, not only on the top-level order.

Reason:

- Yeongju and Jeju teams prepare independently.
- One team can be ready while another is still preparing.

## Status Transitions

Allowed:

- `PAYMENT_PENDING -> PAID`
- `PAYMENT_CHECKING -> PAID`
- `PAYMENT_ISSUE -> PAID`
- `PAID -> READY`
- `READY -> COMPLETE`

Special:

- Customer action `입금했어요` moves pending sections to `PAYMENT_CHECKING`.
- Admin can mark payment issue from payment checking if implemented in UI.
- Cancel should remain admin-only.

## Customer Pickup Screen

- Shows the customer's current order immediately from local/session state.
- May show team-specific cards for the same order number.
- Background sync may add earlier same-customer orders.
- Realtime updates should replace polling where available.

## Admin Scope

- Master admin:
  - sees all teams
  - updates all sections
  - updates all menu availability
- Team admin:
  - sees only own team sections
  - updates only own team section statuses
  - updates only own team menus

