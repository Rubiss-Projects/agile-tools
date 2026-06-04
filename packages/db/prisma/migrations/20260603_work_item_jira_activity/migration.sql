ALTER TABLE "SyncWorkItemStage"
  ADD COLUMN "jiraUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "latestCommentAuthor" TEXT,
  ADD COLUMN "latestCommentBody" TEXT,
  ADD COLUMN "latestCommentCreatedAt" TIMESTAMP(3);

ALTER TABLE "WorkItem"
  ADD COLUMN "jiraUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "latestCommentAuthor" TEXT,
  ADD COLUMN "latestCommentBody" TEXT,
  ADD COLUMN "latestCommentCreatedAt" TIMESTAMP(3);

