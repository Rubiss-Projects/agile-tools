-- Add optional issueTypeName column to WorkItem for display in projections
ALTER TABLE "WorkItem" ADD COLUMN "issueTypeName" TEXT;
