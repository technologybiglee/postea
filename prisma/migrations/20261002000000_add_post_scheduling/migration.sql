-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'scheduled' BEFORE 'published';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "scheduled_at" TIMESTAMP(3),
ADD COLUMN "published_at" TIMESTAMP(3);

-- Backfill: already-published posts take their creation date as publish date.
UPDATE "posts" SET "published_at" = "created_at" WHERE "status" = 'published';

-- CreateIndex
CREATE INDEX "posts_status_scheduled_at_idx" ON "posts"("status", "scheduled_at");
