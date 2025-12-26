# Multi-stage Production Dockerfile for 10 Minute Pokemon
# Builds both React frontends and Node.js backend into a single container
# Uses nginx for static files and reverse proxy, supervisord for process management

# -----------------------------------------------------------------------------
# Stage 1: Build Kiosk Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Copy package files first for better layer caching
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend/ ./

# Set production API URL - uses relative path since nginx will proxy
ENV REACT_APP_API_URL=""

# Build the React app
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Build Admin Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS admin-builder

WORKDIR /build/admin

# Copy package files first for better layer caching
COPY admin/package*.json ./

# Install dependencies (using npm install since admin is part of workspace without its own lock file)
RUN npm install

# Copy source code
COPY admin/ ./

# Set production API URL - uses relative path since nginx will proxy
ENV REACT_APP_API_URL=""

# Build the React app
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Prepare Backend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend-builder

WORKDIR /build/backend

# Copy package files
COPY backend/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy backend source code
COPY backend/ ./

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
