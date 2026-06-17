---
doc_id: order-create-single-rpc
title: "결정: 주문 생성 단일 RPC 통합 (동시주문 p95 개선)"
doc_type: decision
status: active
tags:
  - decision
  - performance
  - order
  - supabase
related:
  - order-aggregate
---

# 결정: 주문 생성을 단일 RPC로 통합

## 맥락 / 문제

부하테스트(prod) 결과 **정합성은 완벽**(200 동시주문 누락0/중복0/번호연속)이나, 동시주문 버스트에서 지연이 큼.

| 시나리오 | p95 |
|---|---|
| 주문 30 동시 (용량 충분) | 0.84s |
| 주문 100 동시 (replica 3) | 4.3s |
| 주문 100 동시 (replica 10) | 2.9s |
| 주문 200 동시 (replica 1, 콜드) | 16s |

목표: 동시 100건 p95 **1초대**.

## 원인

병목은 **DB 용량이 아니라 주문 1건당 Supabase 순차 왕복 횟수**:
`next_order_no` RPC → orders insert → order_sections insert → order_items insert = **순차 4왕복**(서울↔서울). 100 동시 × 4왕복이 free-tier PostgREST 동시처리 한계에서 큐잉. 카운터 행 락은 sub-ms라 병목 아님.

## 결정

주문 생성을 **Postgres 함수 `create_order` 1회 호출**로 통합 (`migration/create-order-rpc.sql`).

- 왕복 4 → 1, PostgREST 부하 1/4
- **단일 트랜잭션**: 카운터 증가 포함 전체 원자적 → 실패 시 롤백되어 번호 누수 없음 (기존엔 RPC 후 insert 실패 시 번호 gap 가능했음)
- **서버 권위 가격**: menus 조인으로 재계산 → 클라이언트 가격 위조 차단(보안 덤)
- **무중단 롤아웃**: 앱은 RPC 미적용(PGRST202) 감지 시 기존 4왕복 경로로 자동 폴백. SQL 적용 전후 모두 동작.

반환은 `{order, sections(teams 중첩), items}` jsonb → 기존 `mapOrder` 그대로 재사용.

## 기각한 대안

- **Supabase 컴퓨트 업그레이드 우선**: 앱이 필요량의 4배를 DB에 때리는 게 진짜 원인. 왕복부터 줄이고 측정 후 tier 결정. (돈 들기 전 코드로 해결)
- **Redisson/분산락**: 번호 중복은 이미 행 락이 해결. 스택도 JVM 아님 → 부적용.
- **고유 식별 금액(주문별 금액 끝자리 변조)**: 기부 맥락상 부적절 + 손님 반올림 송금 리스크. 사용자 명시 거부.

## 결과 (측정)

- 적용 전(폴백/4왕복) 100 동시: p95 2.9~4.3s.
- 적용 후(단일 RPC) 100 동시: **TODO — SQL 적용 후 재측정해 갱신**.

## Codex 크로스리뷰 증거 (base=main)

- **accepted P2** — RPC가 중복 menuId 미집계 → 메뉴당 99 상한 우회 가능. 수정: `_li`에서 menu_id 합산 후 1..99 검증, 메뉴당 1행 insert.
- **accepted P3** — `changeStatus`가 에러를 삼켜 입금확정 실패에도 실행취소 토스트 노출. 수정: 성공여부 반환 → 성공 시에만 토스트.
- **accepted P1** — `orders.depositor_name`이 트랙된 schema.sql에 없음(prod엔 존재). 수정: schema.sql에 컬럼 반영.
- **deferred** — seed.example.sql 구팀(yeongju/jeju) 미비활성화. 기존 이슈·이번 변경 무관·prod 무영향 → 별도 처리.

커밋: `051aef6`. 검증: typecheck 통과 + 폴백 경로 prod E2E. RPC 적용 후 100동시 재측정 예정.

## 운영 메모

- 적용: Supabase SQL Editor에서 `migration/create-order-rpc.sql` 1회 실행.
- 적용 안 해도 폴백으로 정상 동작(느릴 뿐). 적용하면 자동으로 빠른 경로.
- 행사 버스트 대비는 `warm-on.sh`(minReplicas 3) + bootstrap TTL 캐시와 함께 동작.
