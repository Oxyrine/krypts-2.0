FROM python:3.13-slim

WORKDIR /app

# Install system dependencies for Pillow and reportlab
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpng-dev \
    libjpeg-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create non-root user for security
RUN addgroup --system --gid 1001 krypts && adduser --system --uid 1001 --gid 1001 krypts \
    && mkdir -p local_vault \
    && chown -R krypts:krypts /app

# Copy and make entrypoint executable (runs as root to fix mounted volume perms)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

# Run as root so entrypoint.sh can chmod the mounted volume,
# then exec drops into uvicorn (still benefiting from the permission fix)
ENTRYPOINT ["/entrypoint.sh"]
