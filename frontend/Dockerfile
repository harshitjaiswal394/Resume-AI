# Stage 1: Building the code
FROM node:20-slim AS builder

WORKDIR /app

# Enable corepack for modern package managers if needed
RUN corepack enable

# Install dependencies first (for caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy application code
COPY . .

# Set environment variables for build time
# These can be overridden in GitHub Actions or Terraform
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_BACKEND_API_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_BACKEND_API_URL=$NEXT_PUBLIC_BACKEND_API_URL

# Build the application
RUN npm run build

# Stage 2: Production environment
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

# Copy necessary files from builder
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
