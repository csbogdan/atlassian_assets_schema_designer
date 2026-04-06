# ─── Stage 1: deps ────────────────────────────────────────────────────────────
# Install only production Node dependencies (no devDeps, no build yet).
# Cached separately so source changes don't bust the npm install layer.
FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts


# ─── Stage 2: builder ─────────────────────────────────────────────────────────
# Full devDeps + build.  Source files are copied after package install so that
# editing a .tsx file only reruns `npm run build`, not `npm ci`.
FROM node:22-slim AS builder

WORKDIR /app

# Install all deps (including devDeps needed for the Next.js build)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build Next.js standalone output (smaller runtime image)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# ─── Stage 3: runner ──────────────────────────────────────────────────────────
# Minimal runtime image.  Includes:
#   • Next.js standalone server
#   • Python 3 + pip packages used by the scripts/ utilities
FROM node:22-slim AS runner

WORKDIR /app

# ── System packages ────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies ────────────────────────────────────────────────────────
# Create an isolated venv so pip doesn't fight with the system package manager
RUN python3 -m venv /opt/pyenv
ENV PATH="/opt/pyenv/bin:$PATH"

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ── Next.js standalone ─────────────────────────────────────────────────────────
# Copy the standalone server, static assets, and public directory
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ── Python scripts ─────────────────────────────────────────────────────────────
COPY --from=builder /app/scripts ./scripts

# ── Runtime config ─────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Standalone server listens on PORT (default 3000)
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs
USER nextjs

EXPOSE 3000

# Persistent project storage — mount a volume here to survive container restarts
VOLUME ["/app/projects"]

CMD ["node", "server.js"]
