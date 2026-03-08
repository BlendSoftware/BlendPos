#!/bin/sh
set -e

echo "🔄 Running database migrations..."
if [ -n "$DATABASE_URL" ]; then
    # Run migrations, exit code 0 means success or "no change"
    if migrate -path /migrations -database "$DATABASE_URL" up; then
        echo "✅ Migrations completed successfully"
    else
        EXIT_CODE=$?
        # Exit code 1 usually means "no change" or "already up to date"
        if [ $EXIT_CODE -eq 1 ]; then
            echo "ℹ️  No new migrations to apply (already up to date)"
        else
            echo "❌ Migration failed with exit code $EXIT_CODE"
            exit $EXIT_CODE
        fi
    fi
else
    echo "⚠️  DATABASE_URL not set — skipping migrations"
fi

echo "🚀 Starting BlendPOS backend..."
exec /blendpos
