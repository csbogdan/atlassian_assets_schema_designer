#!/usr/bin/env bash
# Usage: ./scripts/deploy-azure.sh <resource-group> <prefix>
#
# Fully idempotent — safe to re-run. Re-running redeploys the app and
# updates config without touching existing secrets or recreating resources.
#
# Creates (once):
#   - Azure App Service Plan (B2 Linux)
#   - Azure Web App (Node.js 22)
#   - Azure Database for PostgreSQL Flexible Server (B1ms)
#   - Azure Key Vault
#
# Assumes: az CLI is logged in and a subscription is active.
# Region: westeurope (hardcoded)

set -euo pipefail

# ── Timing helpers ────────────────────────────────────────────────────────────
DEPLOY_START=$SECONDS
_step_start=$SECONDS
step_start() { _step_start=$SECONDS; }
step_done()  {
  local elapsed=$(( SECONDS - _step_start ))
  echo "    done in ${elapsed}s"
}

RESOURCE_GROUP="${1:?Usage: $0 <resource-group> <prefix>}"
PREFIX="${2:?Usage: $0 <resource-group> <prefix>}"
REGION="westeurope"

PLAN_NAME="${PREFIX}-plan"
APP_NAME="${PREFIX}-app"
PG_SERVER="${PREFIX}-pg"
PG_DB="jsm_assets"
PG_USER="jsmapp"
KV_NAME="${PREFIX}-kv"
APP_URL="https://${APP_NAME}.azurewebsites.net"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Resource group: $RESOURCE_GROUP"
echo "==> Prefix:         $PREFIX"
echo "==> Region:         $REGION"
echo ""

# ── 1. Resource group ─────────────────────────────────────────────────────────
step_start; echo "[1/8] Resource group..."
az group create --name "$RESOURCE_GROUP" --location "$REGION" --output none
step_done

# ── 2. Probe existing resources in parallel ───────────────────────────────────
# Fire all existence checks concurrently so we only wait once.
step_start; echo "[2/8] Probing existing resources (parallel)..."
PROBE_DIR="$(mktemp -d)"
az appservice plan show --name "$PLAN_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null \
  && touch "$PROBE_DIR/plan" || true &
az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null \
  && touch "$PROBE_DIR/app" || true &
az postgres flexible-server show --name "$PG_SERVER" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null \
  && touch "$PROBE_DIR/pg" || true &
az keyvault show --name "$KV_NAME" --output none 2>/dev/null \
  && touch "$PROBE_DIR/kv" || true &
wait
PLAN_EXISTS="$([[ -f "$PROBE_DIR/plan" ]] && echo true || echo false)"
APP_EXISTS="$([[ -f "$PROBE_DIR/app"  ]] && echo true || echo false)"
PG_EXISTS="$([[ -f "$PROBE_DIR/pg"   ]] && echo true || echo false)"
KV_EXISTS="$([[ -f "$PROBE_DIR/kv"   ]] && echo true || echo false)"
rm -rf "$PROBE_DIR"
step_done

# ── 3. npm install (skipped when lockfile unchanged) + build — run in background
cd "$REPO_ROOT"
LOCK_HASH="$(md5 -q package-lock.json 2>/dev/null || md5sum package-lock.json 2>/dev/null | cut -d' ' -f1 || echo '')"
HASH_FILE="node_modules/.deploy-install-hash"

echo "[build] Starting npm install + build in background..."
BUILD_START=$SECONDS
(
  if [[ -n "$LOCK_HASH" && "$(cat "$HASH_FILE" 2>/dev/null)" == "$LOCK_HASH" ]]; then
    echo "[build] node_modules up to date — skipping npm ci"
  else
    echo "[build] Running npm ci..."
    npm ci --prefer-offline --no-audit --no-fund
    echo "$LOCK_HASH" > "$HASH_FILE"
  fi
  echo "[build] Running npm run build..."
  npm run build
  echo "[build] Done in $(( SECONDS - BUILD_START ))s."
) &
BUILD_PID=$!

# ── 4. App Service Plan ───────────────────────────────────────────────────────
step_start; echo "[3/8] App Service Plan..."
if [[ "$PLAN_EXISTS" != "true" ]]; then
  az appservice plan create \
    --name "$PLAN_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$REGION" \
    --sku B2 \
    --is-linux \
    --output none
else
  echo "      (already exists)"
fi
step_done

# ── 5. Web App ────────────────────────────────────────────────────────────────
step_start; echo "[4/8] Web App..."
if [[ "$APP_EXISTS" != "true" ]]; then
  az webapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --plan "$PLAN_NAME" \
    --runtime "NODE:22-lts" \
    --output none
else
  echo "      (already exists)"
fi

# Run webapp config updates in parallel (all idempotent)
az webapp update \
  --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --https-only true --output none &
WEBAPP_UPDATE_PID=$!
az webapp config set \
  --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --startup-file "node server.js" --output none &
WEBAPP_CONFIG_PID=$!
IDENTITY_PRINCIPAL="$(az webapp identity assign \
  --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --query principalId -o tsv)"
wait "$WEBAPP_UPDATE_PID" "$WEBAPP_CONFIG_PID"
step_done

# ── 6. PostgreSQL + Key Vault in parallel ─────────────────────────────────────
step_start; echo "[5/8] PostgreSQL Flexible Server..."
NEW_PG=false
PG_PASSWORD=""
if [[ "$PG_EXISTS" != "true" ]]; then
  PG_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  az postgres flexible-server create \
    --name "$PG_SERVER" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$REGION" \
    --admin-user "$PG_USER" \
    --admin-password "$PG_PASSWORD" \
    --sku-name Standard_B1ms \
    --tier Burstable \
    --storage-size 32 \
    --version 16 \
    --yes \
    --output none
  NEW_PG=true
else
  echo "      (already exists)"
fi

# Firewall rule + DB create can run in parallel with Key Vault setup
az postgres flexible-server firewall-rule create \
  --name "$PG_SERVER" --resource-group "$RESOURCE_GROUP" \
  --rule-name "AllowAzureServices" \
  --start-ip-address "0.0.0.0" --end-ip-address "0.0.0.0" \
  --output none 2>/dev/null &
FW_PID=$!
az postgres flexible-server db create \
  --server-name "$PG_SERVER" --resource-group "$RESOURCE_GROUP" \
  --database-name "$PG_DB" --output none 2>/dev/null &
DB_CREATE_PID=$!
step_done

step_start; echo "[6/8] Key Vault..."
if [[ "$KV_EXISTS" != "true" ]]; then
  az keyvault create \
    --name "$KV_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$REGION" \
    --enable-rbac-authorization false \
    --output none
else
  echo "      (already exists)"
fi
# Only set policy when KV or App was newly created — it's already set on re-runs.
KV_POLICY_PID=""
if [[ "$KV_EXISTS" != "true" || "$APP_EXISTS" != "true" ]]; then
  az keyvault set-policy \
    --name "$KV_NAME" \
    --object-id "$IDENTITY_PRINCIPAL" \
    --secret-permissions get list \
    --output none &
  KV_POLICY_PID=$!
else
  echo "      (policy already set — skipping)"
fi

wait "$FW_PID" "$DB_CREATE_PID" ${KV_POLICY_PID:+"$KV_POLICY_PID"}
step_done

step_start; echo "[7/8] Secrets..."
# On re-runs we never actually use DATABASE_URL (appsettings reference KV directly).
# Only fetch it from KV when NEW_PG=true (needed for create-user.ts).
DATABASE_URL=""
if [[ "$NEW_PG" == "true" ]]; then
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_SERVER}.postgres.database.azure.com:5432/${PG_DB}?sslmode=require"
  NEXTAUTH_SECRET="$(openssl rand -base64 32)"
  ADMIN_KEY="$(openssl rand -base64 32)"
  echo "      (new PostgreSQL — storing secrets in Key Vault)"
  # Write secrets in parallel
  az keyvault secret set --vault-name "$KV_NAME" --name "AUTH-SECRET"  --value "$NEXTAUTH_SECRET" --output none &
  AZ_S1=$!
  az keyvault secret set --vault-name "$KV_NAME" --name "DATABASE-URL" --value "$DATABASE_URL"    --output none &
  AZ_S2=$!
  az keyvault secret set --vault-name "$KV_NAME" --name "ADMIN-KEY"    --value "$ADMIN_KEY"       --output none &
  AZ_S3=$!
  wait "$AZ_S1" "$AZ_S2" "$AZ_S3"
else
  echo "      (existing secrets — skipping Key Vault read/write)"
fi
step_done

step_start; echo "[8/8] Configuring App Service..."
# All settings are static (derived from PREFIX/KV_NAME). Hash them and skip if unchanged.
SETTINGS_HASH="$(echo "NODE_ENV=production AUTH_URL=$APP_URL AUTH_TRUST_HOST=true WEBSITES_PORT=3000 SCM_DO_BUILD_DURING_DEPLOYMENT=false KV=$KV_NAME" \
  | md5 -q 2>/dev/null || echo "NODE_ENV=production AUTH_URL=$APP_URL AUTH_TRUST_HOST=true WEBSITES_PORT=3000 SCM_DO_BUILD_DURING_DEPLOYMENT=false KV=$KV_NAME" \
  | md5sum | cut -d' ' -f1)"
SETTINGS_HASH_FILE="$REPO_ROOT/.deploy-settings-hash"
if [[ "$(cat "$SETTINGS_HASH_FILE" 2>/dev/null)" == "$SETTINGS_HASH" ]]; then
  echo "      (settings unchanged — skipping)"
else
  az webapp config appsettings set \
    --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --settings \
      NODE_ENV="production" \
      AUTH_URL="$APP_URL" \
      AUTH_TRUST_HOST="true" \
      WEBSITES_PORT="3000" \
      SCM_DO_BUILD_DURING_DEPLOYMENT="false" \
      "AUTH_SECRET=@Microsoft.KeyVault(VaultName=${KV_NAME};SecretName=AUTH-SECRET)" \
      "DATABASE_URL=@Microsoft.KeyVault(VaultName=${KV_NAME};SecretName=DATABASE-URL)" \
      "ADMIN_KEY=@Microsoft.KeyVault(VaultName=${KV_NAME};SecretName=ADMIN-KEY)" \
    --output none
  echo "$SETTINGS_HASH" > "$SETTINGS_HASH_FILE"
fi
step_done

# ── Create first user (only on first run) ────────────────────────────────────
if [[ "$NEW_PG" == "true" ]]; then
  echo ""
  read -rp  "Admin email:    " ADMIN_EMAIL
  read -rp  "Admin name:     " ADMIN_NAME
  read -rsp "Admin password: " ADMIN_PASSWORD
  echo ""
  DATABASE_URL="$DATABASE_URL" npx tsx "$(dirname "$0")/create-user.ts" \
    "$ADMIN_EMAIL" "$ADMIN_NAME" "$ADMIN_PASSWORD"
fi

# ── Wait for build, then package and deploy ───────────────────────────────────
echo ""
step_start; echo "[deploy] Waiting for build..."
wait "$BUILD_PID"
step_done

step_start; echo "[deploy] Packaging..."
DEPLOY_ZIP="/tmp/jsm-deploy-$$.zip"
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public || true
cd .next/standalone
# -1 = fastest compression (minimal CPU, minimal size difference for JS/JSON)
zip -r -1 "$DEPLOY_ZIP" . -q
cd "$REPO_ROOT"
step_done

step_start; echo "[deploy] Uploading..."
az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --src-path "$DEPLOY_ZIP" \
  --type zip \
  --output none
step_done

rm "$DEPLOY_ZIP"

echo ""
echo "✓ Done in $(( SECONDS - DEPLOY_START ))s — $APP_URL"
