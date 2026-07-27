/*
  Warnings:

  - Made the column `timestamp` on table `click_events` required. This step will fail if there are existing NULL values in that column.
  - Made the column `clicks` on table `urls` required. This step will fail if there are existing NULL values in that column.
  - Made the column `is_active` on table `urls` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `urls` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `urls` required. This step will fail if there are existing NULL values in that column.
  - Made the column `is_active` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `created_at` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "click_events" DROP CONSTRAINT "click_events_url_id_fkey";

-- DropForeignKey
ALTER TABLE "urls" DROP CONSTRAINT "urls_user_id_fkey";

-- DropIndex
DROP INDEX "idx_urls_expires_active";

-- Recreate index dropped above
CREATE INDEX IF NOT EXISTS "idx_urls_expires_active" ON "urls"("expires_at", "is_active");

-- AlterTable
ALTER TABLE "click_events" ALTER COLUMN "timestamp" SET NOT NULL,
ALTER COLUMN "timestamp" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "urls" ALTER COLUMN "clicks" SET NOT NULL,
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "is_active" SET NOT NULL,
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "is_active" SET NOT NULL,
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "urls" ADD CONSTRAINT "urls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_url_id_fkey" FOREIGN KEY ("url_id") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_click_events_timestamp" RENAME TO "click_events_timestamp_idx";

-- RenameIndex
ALTER INDEX "idx_click_events_url_id" RENAME TO "click_events_url_id_idx";

-- RenameIndex
ALTER INDEX "idx_click_events_url_timestamp" RENAME TO "click_events_url_id_timestamp_idx";

-- RenameIndex
ALTER INDEX "idx_urls_expires_at" RENAME TO "urls_expires_at_idx";

-- RenameIndex
ALTER INDEX "idx_urls_short_code" RENAME TO "urls_short_code_idx";

-- RenameIndex
ALTER INDEX "idx_urls_user_created" RENAME TO "urls_user_id_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_urls_user_id" RENAME TO "urls_user_id_idx";
