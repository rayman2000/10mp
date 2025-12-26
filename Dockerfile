# Multi-stage Production Dockerfile for 10 Minute Pokemon
# Builds both React frontends and Node.js backend into a single container
# Uses nginx for static files and reverse proxy, supervisord for process management

# -----------------------------------------------------------------------------
# Stage 1: Build Kiosk Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy frontend package.json for workspace
COPY frontend/package.json frontend/

# Install frontend dependencies using workspaces
RUN npm ci --workspace=frontend

# Copy frontend source code
COPY frontend/ frontend/

# Set production API URL - uses relative path since nginx will proxy
ENV REACT_APP_API_URL=""

# Build the React app
RUN npm run build --workspace=frontend

# -----------------------------------------------------------------------------
# Stage 2: Build Admin Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS admin-builder

WORKDIR /build

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy admin package.json for workspace
COPY admin/package.json admin/

# Install admin dependencies using workspaces
RUN npm ci --workspace=admin

# Copy admin source code
COPY admin/ admin/

# Set production API URL - uses relative path since nginx will proxy
ENV REACT_APP_API_URL=""

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

# Install nginx, supervisord, and curl for health checks
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl

# Create necessary directories
RUN mkdir -p /var/log/supervisor \
    /var/run/nginx \
    /run/nginx \
    /var/cache/nginx \
    /app/frontend \
    /app/admin \
    /app/backend

# Copy built frontend assets
COPY --from=frontend-builder /build/frontend/build /app/frontend
COPY --from=admin-builder /build/admin/build /app/admin

# Copy backend application
COPY --from=backend-builder /build/backend /app/backend
COPY --from=backend-builder /build/node_modules /app/node_modules

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set working directory
WORKDIR /app

# Expose port 80 (nginx)
EXPOSE 80

# Health check via nginx
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start supervisord which manages both nginx and node
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
