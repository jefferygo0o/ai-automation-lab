FROM oven/bun:1.3.11 AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS install
WORKDIR /app
RUN apt-get update -qq && apt-get install -y --no-install-recommends python3 build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

FROM install AS runtime
WORKDIR /app
RUN apt-get update -qq && apt-get install -y --no-install-recommends curl ca-certificates nodejs npm python3 python3-pip && rm -rf /var/lib/apt/lists/* && curl -fsSL https://astral.sh/uv/install.sh | sh && rm -rf /root/.cargo
ENV PATH="/root/.local/bin:$PATH"
COPY --from=install /app/node_modules ./node_modules
COPY backend/ ./backend/

ENV PORT=7778
ENV LAB_PROJECT_ROOT=/app
ENV LAB_DIST=/app/backend/dist-spa
ENV LAB_DATA_DIR=/app/backend/data
EXPOSE 7778
WORKDIR /app/backend
CMD ["bun", "run", "src/server.ts"]
