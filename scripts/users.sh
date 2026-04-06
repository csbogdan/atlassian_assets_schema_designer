#!/usr/bin/env bash
# Usage: ./scripts/users.sh <resource-group> <prefix>
# Fetches DATABASE_URL from Key Vault and opens the interactive user manager.
# Temporarily whitelists your local public IP in the PostgreSQL firewall.

set -euo pipefail

RESOURCE_GROUP="${1:?Usage: $0 <resource-group> <prefix>}"
PREFIX="${2:?Usage: $0 <resource-group> <prefix>}"
KV_NAME="${PREFIX}-kv"
PG_SERVER="${PREFIX}-pg"
FW_RULE="LocalAdmin-$$"

echo "Fetching secrets from Key Vault..."
DATABASE_URL="$(az keyvault secret show --vault-name "$KV_NAME" --name "DATABASE-URL" --query value -o tsv)"
ADMIN_KEY="$(az keyvault secret show --vault-name "$KV_NAME" --name "ADMIN-KEY" --query value -o tsv)"

# Detect local public IP and open firewall temporarily.
LOCAL_IP="$(curl -sf https://api.ipify.org)"
echo "Opening PostgreSQL firewall for $LOCAL_IP..."
az postgres flexible-server firewall-rule create \
  --name "$PG_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --rule-name "$FW_RULE" \
  --start-ip-address "$LOCAL_IP" \
  --end-ip-address "$LOCAL_IP" \
  --output none

cleanup() {
  echo ""
  echo "Removing temporary firewall rule..."
  az postgres flexible-server firewall-rule delete \
    --name "$PG_SERVER" \
    --resource-group "$RESOURCE_GROUP" \
    --rule-name "$FW_RULE" \
    --yes --output none 2>/dev/null || true
}
trap cleanup EXIT

export DATABASE_URL
export ADMIN_KEY
export APP_URL="https://${PREFIX}-app.azurewebsites.net"
export NODE_ENV="production"
npx tsx "$(dirname "$0")/manage-users.ts"
