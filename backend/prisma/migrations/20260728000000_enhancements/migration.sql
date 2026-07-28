-- Add role to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'USER';

-- Add new fields to urls
ALTER TABLE "urls" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "urls" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "urls" ADD COLUMN IF NOT EXISTS "password" VARCHAR(255);
ALTER TABLE "urls" ADD COLUMN IF NOT EXISTS "max_clicks" BIGINT;
ALTER TABLE "urls" ADD COLUMN IF NOT EXISTS "is_one_time" BOOLEAN NOT NULL DEFAULT false;

-- Add new fields to click_events
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "city" VARCHAR(100);
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "browser" VARCHAR(100);
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "os" VARCHAR(100);
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "utm_source" VARCHAR(255);
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "utm_medium" VARCHAR(255);
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "utm_campaign" VARCHAR(255);

-- Performance indexes
CREATE INDEX IF NOT EXISTS "urls_is_active_idx" ON "urls"("is_active");
