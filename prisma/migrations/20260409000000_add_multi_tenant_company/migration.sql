-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateTable
CREATE TABLE "company_settings" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "allowed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_post_status" "PostStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_company_id_key" ON "company_settings"("company_id");

-- Seed default company so existing rows can reference it
INSERT INTO "companies" ("id", "name", "slug", "updated_at")
VALUES (1, 'Default Company', 'default', CURRENT_TIMESTAMP);

INSERT INTO "company_settings" ("company_id", "updated_at")
VALUES (1, CURRENT_TIMESTAMP);

SELECT setval(pg_get_serial_sequence('companies', 'id'), GREATEST((SELECT MAX(id) FROM companies), 1));

-- Add company_id to users
ALTER TABLE "users" ADD COLUMN "company_id" INTEGER;
UPDATE "users" SET "company_id" = 1;
ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;

-- Add company_id to categories
ALTER TABLE "categories" ADD COLUMN "company_id" INTEGER;
UPDATE "categories" SET "company_id" = 1;
ALTER TABLE "categories" ALTER COLUMN "company_id" SET NOT NULL;

-- Drop old global unique and add composite unique for categories
DROP INDEX "categories_name_key";

-- Add company_id to tags
ALTER TABLE "tags" ADD COLUMN "company_id" INTEGER;
UPDATE "tags" SET "company_id" = 1;
ALTER TABLE "tags" ALTER COLUMN "company_id" SET NOT NULL;

-- Drop old global unique and add composite unique for tags
DROP INDEX "tags_name_key";

-- Add company_id to posts
ALTER TABLE "posts" ADD COLUMN "company_id" INTEGER;
UPDATE "posts" SET "company_id" = 1;
ALTER TABLE "posts" ALTER COLUMN "company_id" SET NOT NULL;

-- Drop old global unique and add composite unique for posts
DROP INDEX "posts_slug_key";

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (composite uniques)
CREATE UNIQUE INDEX "categories_company_id_name_key" ON "categories"("company_id", "name");
CREATE UNIQUE INDEX "tags_company_id_name_key" ON "tags"("company_id", "name");
CREATE UNIQUE INDEX "posts_company_id_slug_key" ON "posts"("company_id", "slug");
