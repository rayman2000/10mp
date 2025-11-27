# Development stage
FROM node:25-alpine AS development

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm install

# Copy source code
COPY . .

# Use the existing node user (uid:gid 1000:1000) which matches most host systems
# This avoids permission issues with volume mounts in development
RUN chown -R node:node /app

USER node

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["npm", "run", "dev"]

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Use the existing node user (uid:gid 1000:1000) for production
RUN chown -R node:node /app

USER node

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["npm", "start"]