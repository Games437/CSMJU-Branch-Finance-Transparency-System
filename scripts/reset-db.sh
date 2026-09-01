#!/usr/bin/env bash
# Full local reset that avoids `prisma migrate dev` / `prisma migrate reset`,
# because both auto-generate and apply a corrective migration whenever the
# database (after replaying migration history) doesn't match schema.prisma
# exactly — which silently drops the CHECK constraint and partial unique
# index that only exist in migration.sql, not in schema.prisma.
#
# This script instead: wipes the Postgres volume -> starts fresh ->
# applies existing migration files verbatim via `migrate deploy` -> seeds.
set -euo pipefail

echo "Stopping and wiping local Postgres volume..."
docker compose down -v

echo "Starting fresh Postgres..."
docker compose up -d postgres

echo "Waiting for Postgres to be ready..."
until docker compose exec -T postgres pg_isready -U bfts -d bfts_dev >/dev/null 2>&1; do
  sleep 1
done

echo "Applying migrations (deploy — no schema.prisma reconciliation)..."
npx prisma migrate deploy

echo "Generating Prisma Client..."
npx prisma generate

echo "Seeding + running smoke tests..."
npx prisma db seed

echo "Done."
