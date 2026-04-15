# Stage 1: Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Enable corepack for modern package managers
RUN corepack enable

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy application source
COPY . .

# Build-time environment variables (defaults allow static page generation to succeed)
ARG NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.placeholder
ARG NEXT_PUBLIC_BACKEND_API_URL=https://app.jaiswal.shop

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_BACKEND_API_URL=$NEXT_PUBLIC_BACKEND_API_URL

# Build for production
RUN npm run build

# Stage 2: Production runner
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary files from the builder for standalone output
# Note: Ensure next.config.js has output: 'standalone' enabled
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

# Next.js standalone server starts with server.js
CMD ["node", "server.js"]
