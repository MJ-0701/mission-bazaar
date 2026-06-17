#!/usr/bin/env bash
# 테스트 데이터 리셋: reset_test_data RPC 호출 → 주문 전체 삭제 + 카운터 0 + sequence 1(다음 4청001).
# 선행: migration/reset-test-data-rpc.sql 를 Supabase에 1회 적용.
# 사용: 저장소 루트에서  bash reset-test-data.sh
# ⚠️ 행사 당일(실주문 후) 실행 금지.
set -euo pipefail
cd "$(dirname "$0")"
set -a; source infra/azure/container-app.env; set +a

EVENT_CODE="${EVENT_CODE:-mission-bazaar-2026}"
deleted=$(curl -fsS -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/reset_test_data" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"p_event_code\":\"$EVENT_CODE\"}")

echo "리셋 완료: 주문 ${deleted}건 삭제, 카운터/시퀀스 초기화 (다음 주문 4청001)."
