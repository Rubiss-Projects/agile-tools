ALTER TABLE "EpicForecastTarget"
  ADD COLUMN "epicLinkIssueKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
