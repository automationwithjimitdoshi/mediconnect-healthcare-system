-- AlterTable
ALTER TABLE "medical_files" ADD COLUMN     "aiAnalysis" TEXT,
ADD COLUMN     "urgencyLevel" TEXT NOT NULL DEFAULT 'LOW';
