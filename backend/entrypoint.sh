#!/bin/sh
set -e

echo "🔄 Running database migrations..."
if [ -n "$DATABASE_URL" ]; then
    migrate -path /migrations -database "$DATABASE_URL" up 2>&1 || {
        echo "⚠️  Migration failed or already up-to-date (continuing...)"
    }
else
    echo "⚠️  DATABASE_URL not set — skipping migrations"
fi

echo "🚀 Starting BlendPOS backend..."
exec /blendpos
