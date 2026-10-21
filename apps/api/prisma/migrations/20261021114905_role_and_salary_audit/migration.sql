-- CreateEnum
CREATE TYPE "role" AS ENUM ('admin', 'analyst');

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "role" "role" NOT NULL DEFAULT 'admin';

-- CreateTable
CREATE TABLE "salary_audit" (
    "id" SERIAL NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "salary_record_id" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "reason" "salary_reason" NOT NULL,
    "previous_amount_minor" BIGINT,
    "previous_currency_code" VARCHAR(3),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_audit_employee_id_recorded_at_idx" ON "salary_audit"("employee_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "salary_audit" ADD CONSTRAINT "salary_audit_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_audit" ADD CONSTRAINT "salary_audit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
