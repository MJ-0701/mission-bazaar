# API Contract

All DB writes go through server API routes. Do not expose Supabase service role keys to the browser.

## Public Bootstrap

`GET /api/public/bootstrap`

Returns menus, teams, payment settings, status labels.

Response:

```json
{
  "appTitle": "선교 바자회 주문",
  "teams": [],
  "menus": [],
  "settings": {
    "bankName": "",
    "accountNumber": "",
    "accountHolder": "",
    "qrImageUrl": ""
  },
  "statusLabels": {}
}
```

## Create Order

`POST /api/orders`

Request:

```json
{
  "pickupName": "채명정",
  "phone": "01077603932",
  "memo": "",
  "items": [
    { "menuId": "uuid", "quantity": 1 }
  ]
}
```

Response:

```json
{
  "orderId": "A002",
  "orderToken": "plain-token-returned-once",
  "pickupName": "채명정",
  "phone": "01077603932",
  "teamName": "영주팀 / 제주팀",
  "totalAmount": 24000,
  "status": "PAYMENT_PENDING",
  "statusLabel": "입금 대기",
  "sections": [
    {
      "sectionId": "uuid",
      "teamId": "uuid",
      "teamName": "영주팀",
      "status": "PAYMENT_PENDING",
      "itemsText": "모닝샌드 x 1 = 8,000원"
    }
  ],
  "payment": {}
}
```

## Customer Payment Notification

`POST /api/orders/:orderId/payment-checking`

Request:

```json
{ "orderToken": "plain-token" }
```

Effect:

- All sections in `PAYMENT_PENDING` become `PAYMENT_CHECKING`.
- `CANCELED` or `COMPLETE` sections are not changed.

## Customer Pickup: Current Order

`GET /api/pickup/orders/:orderId?token=...`

Fast path for the customer pickup screen. Returns only this order's sections.

Use this for frequent refresh or realtime fallback.

## Customer Pickup: Same Customer Orders

`GET /api/pickup/customer?orderId=A002&token=...`

Background sync. Verifies the token for the seed order, derives `customer_key`, then returns all active orders for the same customer.

Use this less frequently than the current-order endpoint.

## Admin Login

`POST /api/admin/login`

Request:

```json
{ "pin": "123456" }
```

Response sets an HTTP-only signed session cookie.

```json
{
  "role": "master",
  "teamId": null,
  "teamName": "통합관리"
}
```

## Admin Orders

`GET /api/admin/orders?status=PAYMENT_CHECKING&teamId=...&q=A002`

Returns team-scoped section cards. Master can see every team.

## Admin Status Update

`PATCH /api/admin/order-sections/:sectionId/status`

Request:

```json
{
  "nextStatus": "PAID",
  "adminNote": "입금 확인 24000원"
}
```

Server must enforce transitions:

- `PAYMENT_PENDING -> PAID`
- `PAYMENT_CHECKING -> PAID`
- `PAYMENT_ISSUE -> PAID`
- `PAID -> READY`
- `READY -> COMPLETE`

## Menu Availability

`PATCH /api/admin/menus/:menuId`

Request:

```json
{ "isAvailable": false }
```

Team admins may only update their team's menus. Master may update all menus.

## Realtime Channels

Subscribe to these DB changes:

- Customer current order: `order_sections` filtered by `order_id`
- Customer full pickup: optional, filtered by `customer_key` through API refresh
- Admin team board: `order_sections` filtered by `team_id`
- Master admin board: `order_sections` for active statuses
- Menu sold-out changes: `menus` filtered by `event_id`

