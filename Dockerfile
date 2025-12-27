# Multi-stage Production Dockerfile for 10 Minute Pokemon
# Builds both React frontends and Node.js backend into a single container
# Express serves static files directly - no nginx needed

# -----------------------------------------------------------------------------
# Stage 1: Build Kiosk Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy frontend package.json and vite config for workspace
COPY frontend/package.json frontend/vite.config.js frontend/

# Install frontend dependencies using workspaces
RUN npm ci --workspace=frontend

# Copy frontend source code
COPY frontend/ frontend/

# Set production API URL - uses relative path since Express serves everything
ENV VITE_API_URL=""

# Build the React app
RUN npm run build --workspace=frontend

# -----------------------------------------------------------------------------
# Stage 2: Build Admin Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS admin-builder

WORKDIR /build

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy admin package.json and vite config for workspace
COPY admin/package.json admin/vite.config.js admin/

# Install admin dependencies using workspaces
RUN npm ci --workspace=admin

# Copy admin source code
COPY admin/ admin/

# Set production API URL - uses relative path since Express serves everything
ENV VITE_API_URL=""

# Build the React app
RUN npm run build --workspace=admin

# -----------------------------------------------------------------------------
# Stage 3: Prepare Backend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend-builder

WORKDIR /build

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy backend package.json for workspace
COPY backend/package.json backend/

# Install backend production dependencies only using workspaces
RUN npm ci --workspace=backend --omit=dev

# Copy backend source code
COPY backend/ backend/

# -----------------------------------------------------------------------------
# Stage 4: Production Runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Create necessary directories
RUN mkdir -p /app/frontend/build /app/admin/build /app/backend

# Copy built frontend assets
COPY --from=frontend-builder /build/frontend/build /app/frontend/build
COPY --from=admin-builder /build/admin/build /app/admin/build

# Copy backend application
COPY --from=backend-builder /build/backend /app/backend
COPY --from=backend-builder /build/node_modules /app/node_modules

# Set working directory
WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port 3001 (Express)
EXPOSE 3001

# Health check via Express
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start Node.js directly
CMD ["node", "backend/index.js"]
