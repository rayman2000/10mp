FROM node:25-bookworm

# Install essential development tools
RUN apt update && apt install -y \
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
