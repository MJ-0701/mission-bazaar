# Azure $0-ish Deployment

Goal: keep cash billing near 0 by using Azure Container Apps consumption mode, GHCR image storage, and the existing Supabase adapter.

## Cost Guardrails

- Use Azure Container Apps with `MIN_REPLICAS=0`.
- Use GHCR instead of Azure Container Registry.
- Start with Supabase Free. Move to Azure PostgreSQL only if Supabase Free is not stable enough during rehearsal.
- Delete or scale down resources after the event.

## 1. Prepare Supabase

1. Create a Supabase project.
2. Run `migration/schema.sql` in SQL Editor.
3. Copy `migration/seed.example.sql`, replace bank account/menu values, then run it.
4. Generate one `COOKIE_SECRET`. Keep this exact value for both PIN hashing and Azure env.
5. Generate PIN hashes:

```bash
COOKIE_SECRET='<same-cookie-secret>' EVENT_CODE='mission-bazaar-2026' \
  node web/scripts/hash-admin-pin.mjs <master-pin> <yeongju-pin> <jeju-pin>
```

6. Copy `migration/admin-pin-template.sql`, replace the three hash placeholders, then run it.

## 2. Build And Push Initial Image

Use GHCR to avoid Azure Container Registry fixed cost.

```bash
export IMAGE='ghcr.io/<github-owner>/<repo>/web:latest'

docker login ghcr.io -u '<github-user>'
docker build -f web/Dockerfile -t "$IMAGE" web
docker push "$IMAGE"
```

If the GHCR package is public, Azure can pull it without credentials. If it is private, create a GitHub PAT with package read permission and set `GHCR_USERNAME` / `GHCR_TOKEN` in the env file below.

## 3. Create Azure Container App

```bash
cp infra/azure/container-app.env.example infra/azure/container-app.env
```

Fill `infra/azure/container-app.env`, then run:

```bash
az login
source infra/azure/container-app.env
infra/azure/create-container-app.sh
```

The script prints:

- app URL
- `/api/health` URL

Use the app URL as the QR destination after one end-to-end rehearsal.

## 4. GitHub Actions Auto Deploy

Create a service principal scoped to the resource group:

```bash
SUBSCRIPTION_ID="$(az account show --query id --output tsv)"

az ad sp create-for-rbac \
  --name mission-bazaar-kiosk-github-actions \
  --role contributor \
  --scopes "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/<resource-group>" \
  --sdk-auth
```

In GitHub repository settings:

- Secret `AZURE_CREDENTIALS`: paste the JSON from the command above.
- Variable `AZURE_RESOURCE_GROUP`: your resource group name.
- Variable `AZURE_CONTAINER_APP_NAME`: your Container App name.

After that, pushes to `main` rebuild the image and update the Container App.

## 5. Rehearsal Checklist

- Customer mobile order creates an order.
- `입금했어요` routes to pickup page.
- Master PIN sees both teams.
- Team PIN sees only its team.
- Status transition works: 입금확인 -> 준비완료 -> 수령완료.
- Cancel requires reason and can be restored.
- Menu soldout status changes immediately after refresh/polling.
- QR opens the production URL on a phone with no login.
