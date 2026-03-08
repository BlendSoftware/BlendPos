#!/bin/sh
set -e

echo "🔄 Running database migrations..."
if [ -n "$DATABASE_URL" ]; then
    migrate -path /migrations -database "$DATABASE_URL" up
    echo "✅ Migrations completed successfully"
else
    echo "⚠️  DATABASE_URL not set — skipping migrations"
fi

echo "🚀 Starting BlendPOS backend..."
exec /blendpos
