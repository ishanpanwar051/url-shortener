-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable: users
CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "hashed_password" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT "users_email_key" UNIQUE ("email"),
    CONSTRAINT "users_username_key" UNIQUE ("username")
);

-- CreateTable: urls
CREATE TABLE IF NOT EXISTS "urls" (
    "id" SERIAL PRIMARY KEY,
    "short_code" VARCHAR(50) NOT NULL,
    "long_url" TEXT NOT NULL,
    "custom_alias" VARCHAR(50),
    "user_id" INTEGER,
    "clicks" BIGINT DEFAULT 0,
    "expires_at" TIMESTAMPTZ,
    "is_active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT "urls_short_code_key" UNIQUE ("short_code"),
    CONSTRAINT "urls_custom_alias_key" UNIQUE ("custom_alias"),
    CONSTRAINT "urls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- CreateTable: click_events
CREATE TABLE IF NOT EXISTS "click_events" (
    "id" SERIAL PRIMARY KEY,
    "url_id" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ DEFAULT NOW(),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "referer" TEXT,
    "country" VARCHAR(100),
    "device" VARCHAR(50),

    CONSTRAINT "click_events_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_urls_short_code" ON "urls"("short_code");
CREATE INDEX IF NOT EXISTS "idx_urls_user_id" ON "urls"("user_id");
CREATE INDEX IF NOT EXISTS "idx_urls_expires_at" ON "urls"("expires_at");
CREATE INDEX IF NOT EXISTS "idx_urls_user_created" ON "urls"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_urls_expires_active" ON "urls"("expires_at", "is_active");
CREATE INDEX IF NOT EXISTS "idx_click_events_url_id" ON "click_events"("url_id");
CREATE INDEX IF NOT EXISTS "idx_click_events_timestamp" ON "click_events"("timestamp");
CREATE INDEX IF NOT EXISTS "idx_click_events_url_timestamp" ON "click_events"("url_id", "timestamp");

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON "users";
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON "users"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_urls_updated_at ON "urls";
CREATE TRIGGER update_urls_updated_at
    BEFORE UPDATE ON "urls"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
