# ---- Base Stage ----
FROM node:20-bullseye AS base
WORKDIR /app

# ---- Dependencies Stage ----
FROM base AS dependencies
COPY package*.json ./
# Use npm ci for reproducible builds and --omit=dev for production
RUN npm ci --omit=dev

# ---- Build Stage ----
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# ---- Final Stage ----
FROM node:20-slim AS final
ENV NODE_ENV=production
WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy built artifacts with correct permissions
COPY --from=build --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=appuser:nodejs /app .

# Switch to the non-root user
USER appuser

# Expose port and start app
# The PORT environment variable is automatically set by Cloud Run.
ENV PORT 8080
EXPOSE 8080
CMD ["npm", "start"]
