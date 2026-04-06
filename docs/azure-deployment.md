# Azure Deployment Guide

This guide covers deploying JSM Assets Schema Designer to Azure App Service with a PostgreSQL Flexible Server database.

---

## 1. Required Azure Resources

### App Service

- **Plan**: B2 Linux (or higher — B2 gives 2 vCPUs / 3.5 GB RAM, sufficient for production)
- **Runtime stack**: Node.js 22 LTS
- **Region**: Choose the same region as your PostgreSQL server to minimise latency

### Azure Database for PostgreSQL Flexible Server

- **SKU**: B1ms (1 vCore / 2 GB RAM) is adequate for small to medium deployments
- **Version**: PostgreSQL 16
- **Firewall**: Allow access from the App Service outbound IPs, or use VNet integration
- **SSL**: Enabled by default — the application connects with `sslmode=require`
- Create a database (e.g. `jsm_assets`) and a dedicated application user with least-privilege access

### Azure Key Vault

- Store all secrets as Key Vault secrets (e.g. `NEXTAUTH-SECRET`, `DATABASE-URL`)
- Grant the App Service's system-assigned managed identity `Get` and `List` permissions on Key Vault secrets

---

## 2. Environment Variables (App Service Configuration)

Set the following Application Settings in the App Service **Configuration** blade:

| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `NEXTAUTH_SECRET` | Key Vault reference (see §4) or a 32-byte random string |
| `NEXTAUTH_URL` | `https://your-app.azurewebsites.net` (your public URL) |
| `DATABASE_URL` | Key Vault reference or `postgresql://user:password@host:5432/dbname?sslmode=require` |

> **Important**: `NEXTAUTH_URL` must exactly match the public URL users will use. If you have a custom domain, set it to that domain.

---

## 3. SSL/TLS

App Service handles TLS termination — no Nginx or reverse-proxy configuration is needed.

1. In the App Service **TLS/SSL settings** blade, enable **HTTPS Only** to redirect all HTTP traffic to HTTPS.
2. App Service provides a free `*.azurewebsites.net` TLS certificate automatically.
3. For custom domains, add your domain in the **Custom domains** blade and bind a certificate (App Service Managed Certificate is free for most cases).

---

## 4. Key Vault Reference Syntax

Instead of pasting raw secrets into App Service configuration, reference Key Vault secrets directly:

```
@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/NEXTAUTH-SECRET/)
```

Or using the version-less URI (always resolves to the latest version):

```
@Microsoft.KeyVault(VaultName=your-vault;SecretName=NEXTAUTH-SECRET)
```

Prerequisites:
1. Enable the App Service's **system-assigned managed identity** (Identity blade → Status: On).
2. In Key Vault → **Access policies**, add the managed identity with `Get` and `List` secret permissions.
3. Replace the plain-text value in App Service Configuration with the reference string above.

---

## 5. Creating the First User

The application does not have a self-registration UI. Create the initial admin account from your local machine or a CI pipeline, pointing at the production database:

```bash
DATABASE_URL="postgresql://user:password@host:5432/jsm_assets?sslmode=require" \
  npx tsx scripts/create-user.ts admin@example.com "Admin" "strong-password"
```

This script upserts the user — re-running it with the same email updates the name and password hash. The users table is created automatically on first run via `initDb()`.

---

## 6. GitHub Actions Deployment

A minimal workflow that builds and deploys to App Service:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Azure App Service

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - run: npm run build

      - uses: azure/webapps-deploy@v3
        with:
          app-name: your-app-service-name
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

To get the publish profile: App Service → **Overview** → **Get publish profile** → save the XML content as the `AZURE_WEBAPP_PUBLISH_PROFILE` GitHub secret.

Alternatively, use the `azure/login` action with a service principal for OIDC-based authentication (recommended for production).

---

## 7. Optional: Azure Application Gateway with WAF

For public-facing production deployments, placing an Application Gateway with Web Application Firewall (WAF) in front of App Service provides:

- **DDoS protection** (especially with WAF v2 + Azure DDoS Protection Standard)
- **Bot protection** via managed rule sets (OWASP CRS + Microsoft Bot Manager)
- **Rate limiting** on the login endpoint to complement the in-app account lockout
- **Custom domain + TLS** at the gateway level

Configuration outline:
1. Create an Application Gateway (WAF_v2 SKU) in the same VNet
2. Set the backend pool to the App Service's default hostname (`your-app.azurewebsites.net`)
3. Add HTTP settings with hostname override so App Service accepts the forwarded request
4. Enable WAF mode: **Prevention** (not just Detection)
5. Restrict App Service access control to only accept traffic from the Application Gateway IP

This is optional — App Service with HTTPS-only and account lockout is adequate for internal or low-risk deployments.

---

## 8. Account Lockout Behaviour

The application enforces the following lockout policy (implemented in `src/lib/db.ts`):

- After **10 consecutive failed login attempts**, the account is locked for **15 minutes**
- The lockout is stored in the `locked_until` column of the `users` table
- A successful login resets the failed attempt counter and clears the lockout
- The login page returns the unlock time in the error message so the user knows when to retry
