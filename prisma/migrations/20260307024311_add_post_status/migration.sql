-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('draft', 'pending', 'published');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "status" "PostStatus" NOT NULL DEFAULT 'draft';
