#!/usr/bin/env bash
set -euo pipefail

: "${RESOURCE_GROUP:=mission-bazaar-rg}"
: "${LOCATION:=koreacentral}"
: "${CONTAINER_APP_ENV:=mission-bazaar-env}"
: "${CONTAINER_APP_NAME:=mission-bazaar-kiosk}"
: "${EVENT_CODE:=mission-bazaar-2026}"
: "${MIN_REPLICAS:=0}"
: "${MAX_REPLICAS:=5}"

: "${IMAGE:?Set IMAGE, for example ghcr.io/<owner>/<repo>/web:latest}"
: "${COOKIE_SECRET:?Set COOKIE_SECRET}"
: "${NEXT_PUBLIC_SUPABASE_URL:?Set NEXT_PUBLIC_SUPABASE_URL}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?Set NEXT_PUBLIC_SUPABASE_ANON_KEY}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

registry_args=()
if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  registry_args=(
    --registry-server ghcr.io
    --registry-username "${GHCR_USERNAME}"
    --registry-password "${GHCR_TOKEN}"
  )
fi

az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --output none

if ! az containerapp env show \
  --name "${CONTAINER_APP_ENV}" \
  --resource-group "${RESOURCE_GROUP}" \
  --output none 2>/dev/null; then
  az containerapp env create \
    --name "${CONTAINER_APP_ENV}" \
    --resource-group "${RESOURCE_GROUP}" \
    --location "${LOCATION}" \
    --output none
fi

if az containerapp show \
  --name "${CONTAINER_APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --output none 2>/dev/null; then
  az containerapp secret set \
    --name "${CONTAINER_APP_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --secrets \
      cookie-secret="${COOKIE_SECRET}" \
      supabase-service-role-key="${SUPABASE_SERVICE_ROLE_KEY}" \
    --output none

  if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_TOKEN:-}" ]]; then
    # 주의: registry set 서브커맨드는 --server (create/update는 --registry-server).
    az containerapp registry set \
      --name "${CONTAINER_APP_NAME}" \
      --resource-group "${RESOURCE_GROUP}" \
      --server ghcr.io \
      --username "${GHCR_USERNAME}" \
      --password "${GHCR_TOKEN}" \
      --output none
  fi

  az containerapp update \
    --name "${CONTAINER_APP_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --image "${IMAGE}" \
    --min-replicas "${MIN_REPLICAS}" \
    --max-replicas "${MAX_REPLICAS}" \
    --set-env-vars \
      NODE_ENV=production \
      EVENT_CODE="${EVENT_CODE}" \
      COOKIE_SECRET=secretref:cookie-secret \
      NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
      NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
      SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-role-key \
    --output none
else
  az containerapp create \
    --name "${CONTAINER_APP_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --environment "${CONTAINER_APP_ENV}" \
    --image "${IMAGE}" \
    --target-port 3010 \
    --ingress external \
    --min-replicas "${MIN_REPLICAS}" \
    --max-replicas "${MAX_REPLICAS}" \
    --cpu 0.25 \
    --memory 0.5Gi \
    "${registry_args[@]}" \
    --secrets \
      cookie-secret="${COOKIE_SECRET}" \
      supabase-service-role-key="${SUPABASE_SERVICE_ROLE_KEY}" \
    --env-vars \
      NODE_ENV=production \
      EVENT_CODE="${EVENT_CODE}" \
      COOKIE_SECRET=secretref:cookie-secret \
      NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
      NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
      SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-role-key \
    --output none
fi

fqdn="$(
  az containerapp show \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${CONTAINER_APP_NAME}" \
    --query properties.configuration.ingress.fqdn \
    --output tsv
)"

echo "Container App is ready:"
echo "https://${fqdn}"
echo
echo "Health check:"
echo "https://${fqdn}/api/health"
