ALTER TABLE "FlowScope"
ADD COLUMN "includedIssueTypeNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "FlowScope" AS scope
SET "includedIssueTypeNames" = COALESCE(
  (
    SELECT array_agg(COALESCE(latest_name."issueTypeName", selected.issue_type_id) ORDER BY selected.ordinality)
    FROM unnest(scope."includedIssueTypeIds") WITH ORDINALITY AS selected(issue_type_id, ordinality)
    LEFT JOIN LATERAL (
      SELECT work_item."issueTypeName"
      FROM "WorkItem" AS work_item
      WHERE work_item."scopeId" = scope."id"
        AND work_item."issueTypeId" = selected.issue_type_id
        AND work_item."issueTypeName" IS NOT NULL
      ORDER BY work_item."updatedAt" DESC
      LIMIT 1
    ) AS latest_name ON TRUE
  ),
  ARRAY[]::TEXT[]
);
