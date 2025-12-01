FROM node:25-alpine

# Install essential development tools
RUN apk add --no-cache \
    git \
    curl \
    bash \
    postgresql-client \
    mc \
    vim

# Set working directory
WORKDIR /workspace

# Expose common ports
EXPOSE 3000 3001 3002 5432 9000 9001

# Keep container running
CMD ["sleep", "infinity"]
