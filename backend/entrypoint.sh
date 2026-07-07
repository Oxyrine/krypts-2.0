#!/bin/sh
# Fix permissions on mounted volume before starting the app
# Railway mounts volumes as root; this runs as root before switching to krypts user
mkdir -p /app/local_vault
chmod 777 /app/local_vault
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
