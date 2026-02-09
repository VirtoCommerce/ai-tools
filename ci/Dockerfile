# CI Dockerfile for Claude Agent SDK regression testing
# Based on Microsoft's official Playwright image (includes Chromium, Firefox, WebKit)
FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

# Install Claude Code CLI (required runtime dependency for Agent SDK)
RUN npm install -g @anthropic-ai/claude-code@latest

# Copy package files first for Docker layer caching
COPY package.json package-lock.json* ./

# Install project dependencies
RUN npm ci --ignore-scripts

# Install CI-specific dependencies
RUN npm install @anthropic-ai/claude-agent-sdk@latest tsx

# Copy the full project
COPY . .

# Create output directories
RUN mkdir -p test-results/chrome/videos test-results/chrome/har reports/regression

# Set environment defaults
ENV CI=true
ENV FORCE_COLOR=0
ENV NODE_ENV=production

ENTRYPOINT ["npx", "tsx", "ci/run-regression.ts"]
