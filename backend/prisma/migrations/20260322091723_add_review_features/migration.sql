-- AlterTable
ALTER TABLE "medical_files" ADD COLUMN     "reviewChecklist" JSONB,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByDoctorId" TEXT;
