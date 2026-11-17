-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('banner', 'bar', 'circular');

-- CreateEnum
CREATE TYPE "EventPosition" AS ENUM ('top', 'bottom', 'top_left', 'top_right', 'bottom_left', 'bottom_right');

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "image" TEXT,
    "cta_text" TEXT,
    "cta_url" TEXT,
    "cta_new_tab" BOOLEAN NOT NULL DEFAULT false,
    "type" "EventType" NOT NULL,
    "position" "EventPosition",
    "background_color" TEXT,
    "text_color" TEXT,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_company_id_type_starts_at_idx" ON "events"("company_id", "type", "starts_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

