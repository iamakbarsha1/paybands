-- CreateEnum
CREATE TYPE "gender" AS ENUM ('female', 'male', 'other', 'undisclosed');

-- CreateEnum
CREATE TYPE "salary_reason" AS ENUM ('hire', 'merit', 'promotion', 'market');

-- CreateTable
CREATE TABLE "currency" (
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "minor_unit" INTEGER NOT NULL,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "country" (
    "code" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "fx_rate" (
    "id" SERIAL NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "rate_to_usd_micros" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "fx_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_level" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "job_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" SERIAL NOT NULL,
    "employee_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "gender" "gender" NOT NULL,
    "hire_date" DATE NOT NULL,
    "termination_date" DATE,
    "country_code" VARCHAR(2) NOT NULL,
    "department_id" INTEGER NOT NULL,
    "job_level_id" INTEGER NOT NULL,
    "manager_id" INTEGER,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_record" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "reason" "salary_reason" NOT NULL,

    CONSTRAINT "salary_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_band" (
    "id" SERIAL NOT NULL,
    "job_level_id" INTEGER NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "min_minor" BIGINT NOT NULL,
    "mid_minor" BIGINT NOT NULL,
    "max_minor" BIGINT NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "pay_band_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fx_rate_currency_code_effective_from_idx" ON "fx_rate"("currency_code", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "department_name_key" ON "department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "job_level_name_key" ON "job_level"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_employee_code_key" ON "employee"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_email_key" ON "employee"("email");

-- CreateIndex
CREATE INDEX "employee_country_code_department_id_job_level_id_idx" ON "employee"("country_code", "department_id", "job_level_id");

-- CreateIndex
CREATE INDEX "employee_termination_date_idx" ON "employee"("termination_date");

-- CreateIndex
CREATE INDEX "salary_record_employee_id_effective_from_idx" ON "salary_record"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "pay_band_job_level_id_country_code_idx" ON "pay_band"("job_level_id", "country_code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- AddForeignKey
ALTER TABLE "country" ADD CONSTRAINT "country_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_job_level_id_fkey" FOREIGN KEY ("job_level_id") REFERENCES "job_level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_record" ADD CONSTRAINT "salary_record_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_record" ADD CONSTRAINT "salary_record_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_band" ADD CONSTRAINT "pay_band_job_level_id_fkey" FOREIGN KEY ("job_level_id") REFERENCES "job_level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_band" ADD CONSTRAINT "pay_band_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_band" ADD CONSTRAINT "pay_band_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (hand-written: the Prisma schema has no syntax for a partial index)
-- An employee has at most one salary record in force. A raise closes the old
-- row and opens the new one in the same transaction; this index is what makes a
-- half-applied raise fail loudly instead of leaving two current salaries.
CREATE UNIQUE INDEX "one_open_salary_per_employee" ON "salary_record"("employee_id") WHERE "effective_to" IS NULL;
