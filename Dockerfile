# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY .env* /app/
RUN npm run build

# Stage 2: Python app
FROM python:3.13-slim

# Install git (needed for GitPython)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install Python dependencies
COPY pyproject.toml uv.lock* ./
COPY src/ src/
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev

# Copy built frontend into the package
COPY --from=frontend-builder /app/frontend/dist /app/src/vantage/frontend_dist

# Default docs mount point
RUN mkdir -p /docs

ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

ENTRYPOINT ["uv", "run", "vantage", "serve", "--host", "0.0.0.0", "/docs"]
