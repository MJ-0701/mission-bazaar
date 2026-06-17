---
doc_id: order-aggregate
title: "Order 애그리거트 — 주문 도메인 모델"
doc_type: note
status: active
tags:
  - ddd
  - domain
  - order
related:
  - llm-wiki-ddd-root
  - order-create-single-rpc
---

# Order 애그리거트

선교 바자회 키오스크의 핵심 도메인. **한 손님 주문 = 1 Order**, 그 안에 팀별 처리 단위가 들어간다.

## 애그리거트 구조

```
Order (주문 1건, 손님 1명)
 ├─ order_no        4청001 … (행사 카운터 기반, 주문당 1개)
 ├─ pickup_name / phone / depositor_name / memo
 ├─ total_amount    (서버 권위 합계)
 └─ OrderSection[]  (팀별 1개 — unique(order_id, team_id))
      ├─ status      팀별 독립 상태 (아래 상태도)
      ├─ subtotal_amount
      └─ OrderItem[] (메뉴별 라인 — 스냅샷: menu_code/name/category/unit_price)
```

- **애그리거트 루트 = Order.** 트랜잭션 경계도 Order 단위 (생성/취소는 Order 통째).
- **OrderSection이 상태/조리 단위.** 한 주문에 여러 팀 메뉴가 섞이면 팀별로 따로 입금확인·준비·수령된다. 그래서 상태는 Order가 아니라 Section에 있다.
- **OrderItem은 메뉴 스냅샷.** 주문 시점의 가격·이름을 복사 저장 → 나중에 메뉴가 바뀌어도 주문 내역 불변.

## Ubiquitous Language (혼동 금지)

| 용어 | 정확한 의미 | 혼동 주의 |
|---|---|---|
| 주문번호(order_no) | 주문당 1개. `4청001`. events 카운터에서 발급 | 섹션마다 있는 게 아님 |
| 입금자명(depositor_name) | 실제 송금하는 사람(예금주) | ≠ 픽업자명(pickup_name). 운영팀은 통장 입금내역과 **입금자명**으로 대조 |
| 픽업자명(pickup_name) | 물건 받으러 오는 사람 | 입금자와 다를 수 있음 |
| 섹션(order_section) | 한 주문 안의 **팀별** 처리 단위 | ≠ 주문. 상태는 여기에 |
| PAYMENT_CHECKING | 손님이 "입금했어요" 누른 상태 = 운영팀이 통장 대조해야 할 큐 | "입금완료" 아님(아직 미확인) |

## 상태 전이 (OrderSection.status)

```
PAYMENT_PENDING ─입금했어요→ PAYMENT_CHECKING ─입금확인→ PAID ─준비완료→ READY ─수령→ COMPLETE
        │                          │  ↑실행취소                  
        └────────→ CANCELED ←──────┘  └─ PAID→PAYMENT_CHECKING (입금확인 실행취소용)
                                       PAYMENT_CHECKING ─입금문제→ PAYMENT_ISSUE
```

- 전이 규칙 단일 원천: `web/lib/domain.ts` `ADMIN_TRANSITIONS`. 서버(`canTransition`)가 강제.

### 운영자 권한(역할)

| 역할 | 권한 |
|---|---|
| **master** | 전체 + **입금확인(→PAID)** |
| **admin** | 입금확인 **제외** 전체(준비완료·수령완료·취소·품절 등) |

- 분리 근거: 입금확인은 돈 대조라 신중해야 하니 master만. 준비/수령 이후는 admin이 처리.
- 강제 지점: 서버 `updateOrderStatus`가 `nextStatus==="PAID" && role!=="master"` 차단(권위). UI는 admin에게 입금확인 버튼만 숨김(보조).
- 콘솔은 단일 행사라 event-wide(두 역할 다 전체 주문/메뉴). team 스코프는 폐기. cross-event 접근은 event_id로 가드.
- PIN/enum: `migration/admin-roles.sql`(enum+제약) → `admin-pin.local.sql`(master/admin 해시, git 제외).
- `PAID → PAYMENT_CHECKING`은 운영자 **실행취소(undo)** 위해 의도적으로 허용.
- 노출 순서는 **무조건 createdAt ASC FIFO** (선입선출). 미확인은 색/대조블록으로만 강조하고 순서는 안 바꾼다.

## 동시성 / 정합성

- **주문번호 중복 0**: events 행 단일 `UPDATE current_order_number+1`(행 락)으로 직렬화 + `unique(event_id, order_no)` 백스톱. 분산락(Redisson 등) 불필요 — 스택도 Node/Supabase라 부적용.
- 200 동시주문 부하테스트: 누락 0 / 중복 0 / 번호 연속 확인.
- 생성 성능 최적화는 [[order-create-single-rpc]] 참고.

## 결제 맥락 (PG 미연동)

- PG 없음 → 계좌이체 + 수동 입금확인. 개인/단기 행사라 PG 가입 비현실적.
- 운영 UX: 새 PAYMENT_CHECKING 소리·진동 알림 → FIFO 큐 → 입금 대조(입금자·금액) → 원탭 입금확인(동명이인만 모달) → 5초 실행취소.
- 손님 편의: 계좌/금액 복사 버튼, 송금 QR(`events.qr_image_url` 설정 시).
