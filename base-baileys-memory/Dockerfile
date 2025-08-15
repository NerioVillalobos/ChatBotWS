# ---- Base Stage ----
FROM node:18-bullseye AS base
WORKDIR /app

# ---- Dependencies Stage ----
FROM base AS dependencies
COPY package*.json ./
RUN npm install --only=production

# ---- Build Stage ----
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# ---- Final Stage ----
FROM node:18-slim AS final
WORKDIR /app

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
USER appuser

# Copy built artifacts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app .

# Expose port and start app
# The PORT environment variable is automatically set by Cloud Run.
ENV PORT 8080
EXPOSE 8080
CMD ["npm", "start"]
