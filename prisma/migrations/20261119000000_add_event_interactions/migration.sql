-- CreateEnum
CREATE TYPE "EventInteractionType" AS ENUM ('impression', 'cta_click', 'dismiss');

-- CreateTable
CREATE TABLE "event_interactions" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "type" "EventInteractionType" NOT NULL,
    "visitor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_interactions_event_id_type_created_at_idx" ON "event_interactions"("event_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "event_interactions_company_id_created_at_idx" ON "event_interactions"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "event_interactions" ADD CONSTRAINT "event_interactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
