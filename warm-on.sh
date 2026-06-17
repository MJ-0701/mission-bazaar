#!/usr/bin/env bash
# 행사 당일 워밍업: 최소 레플리카 3개로 올려 콜드스타트 + 동시주문 버스트 대비.
# 사용법: bash warm-on.sh   (6/20 아침에 실행 예정)
# 근거: 로드테스트 결과 단일 replica는 동시주문 버스트(200건)에서 p50 11s.
#       min 3이면 버스트를 KEDA 스케일 대기 없이 즉시 흡수. max 10으로 헤드룸 확보.
set -euo pipefail
az containerapp update -n mission-bazaar-kiosk -g study-note-be-rg \
  --min-replicas 3 --max-replicas 10 --output none
echo "워밍업 ON: 최소 3개 상시 가동 (콜드스타트 없음 + 버스트 흡수)."
echo "행사 끝나면  bash warm-off.sh  로 0개로 되돌려 비용 절감하세요."
