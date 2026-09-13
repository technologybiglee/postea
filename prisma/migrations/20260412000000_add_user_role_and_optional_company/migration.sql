-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'super_admin');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'user';
ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL;
