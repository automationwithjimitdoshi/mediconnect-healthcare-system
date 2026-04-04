-- AlterTable
ALTER TABLE "medical_files" ADD COLUMN     "patientAnalysis" JSONB,
ADD COLUMN     "patientAnalyzedAt" TIMESTAMP(3);
