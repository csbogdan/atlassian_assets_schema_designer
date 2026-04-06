# Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Running Locally](#running-locally)
3. [Docker (recommended)](#docker-recommended)
4. [Environment Variables](#environment-variables)
5. [Persistent Storage](#persistent-storage)
6. [Production Checklist](#production-checklist)
7. [Upgrading](#upgrading)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 22+ |
| npm | 10+ |
| Python | 3.11+ (only for CLI scripts — see `requirements.txt`) |
| Docker | 24+ (for containerised deployment) |

---

## Running Locally

```bash
# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The development server listens on `http://localhost:3000`.

---

## Docker (recommended)

### Build the image

```bash
docker build -t jsm-schema-designer .
```

The image is built in three stages:
1. **deps** — installs only production Node dependencies
2. **builder** — installs all dev dependencies and runs `npm run build` (Next.js standalone output)
3. **runner** — minimal `node:22-slim` with Python 3 venv

The final image includes:
- Next.js standalone server (`server.js`)
- Python 3 virtual environment at `/opt/pyenv`
- Python packages: `httpx`, `anyio`, `rich`
- CLI scripts at `/app/scripts/`

### Run the container

```bash
# Basic run (ephemeral — projects lost on container stop)
docker run -p 3000:3000 jsm-schema-designer

# With persistent project storage
docker run -p 3000:3000 \
  -v /path/on/host/projects:/app/projects \
  jsm-schema-designer
```

Open `http://localhost:3000`.

### Run with Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.9"
services:
  jsm-schema-designer:
    image: jsm-schema-designer
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./projects:/app/projects
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
```

```bash
docker compose up -d
```

---

## Environment Variables

All variables are optional unless marked **required**.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the Next.js standalone server listens on |
| `HOSTNAME` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | Node environment |
| `NEXT_TELEMETRY_DISABLED` | `1` | Disable Next.js telemetry (set in Dockerfile) |

The application does **not** store API tokens server-side. Tokens are sent per-request from the browser to the Next.js API routes, which proxy them to the Atlassian API. No secrets need to be baked into the image.

---

## Persistent Storage

Projects are stored as JSON files under `/app/projects/` inside the container.

```
/app/projects/
  <project-id>/
    document.json   ← schema-and-mapping document
    meta.json       ← project name, created/updated timestamps
```

Mount a host directory or a named Docker volume to `/app/projects` to persist data across container restarts:

```bash
# Named volume
docker volume create jsm-projects
docker run -p 3000:3000 \
  -v jsm-projects:/app/projects \
  jsm-schema-designer

# Host directory
docker run -p 3000:3000 \
  -v $(pwd)/projects:/app/projects \
  jsm-schema-designer
```

---

## Production Checklist

- [ ] Mount a persistent volume for `/app/projects`
- [ ] Run behind a reverse proxy (nginx, Caddy, Traefik) for TLS termination
- [ ] Set resource limits (recommended: 512 MB RAM, 1 CPU)
- [ ] Restrict network access — the container only needs outbound HTTPS to `api.atlassian.com`
- [ ] Consider read-only filesystem (`--read-only`) with `/app/projects` and `/tmp` writable
- [ ] Review logs with `docker logs <container>`

### Nginx reverse proxy example

```nginx
server {
    listen 443 ssl;
    server_name schema-designer.internal.example.com;

    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

### Caddy example

```
schema-designer.internal.example.com {
    reverse_proxy localhost:3000
}
```

---

## Upgrading

1. Pull or build the new image
2. Stop the running container
3. Start the new container (with the same volume mount)

```bash
docker build -t jsm-schema-designer:new .
docker stop jsm-schema-designer-container
docker run -d --name jsm-schema-designer-container \
  -p 3000:3000 \
  -v jsm-projects:/app/projects \
  jsm-schema-designer:new
```

Projects stored in the volume are compatible across versions (documents are plain JSON files).

---

## Troubleshooting

### Container exits immediately

Check the logs:

```bash
docker logs <container-id>
```

Common causes:
- Port 3000 already in use — use `-p 3001:3000` to map to a different host port
- Volume mount permission issue — ensure the host directory is writable by UID 1001

### "Permission denied" writing to `/app/projects`

The container runs as non-root user `nextjs` (UID 1001). If using a host-directory mount, ensure the directory is owned by or writable by UID 1001:

```bash
sudo chown -R 1001:1001 ./projects
```

### Python scripts fail

Scripts run inside the container using the venv at `/opt/pyenv`. To run a script manually:

```bash
docker exec -it <container> /opt/pyenv/bin/python3 /app/scripts/export_assets_schema_with_icons.py --help
```

### API calls fail with 401

- Verify your Atlassian API token is a personal access token (not a basic password)
- Confirm the token has `import:import-configuration:cmdb` OAuth scope
- Check that the workspace ID and import source ID are correct

### Large documents are slow to validate

Validation runs in a background Web Worker. If the browser tab is CPU-constrained (e.g., running in a low-power VM), validation of 100+ object type documents may take 1–3 seconds. This is expected. The UI shows a "Validating…" indicator while the worker runs.
