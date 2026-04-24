ALTER TABLE "FlowScope"
ADD COLUMN "includedIssueTypeNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

WITH latest_issue_type_names AS (
  SELECT DISTINCT ON (work_item."scopeId", work_item."issueTypeId")
    work_item."scopeId",
    work_item."issueTypeId",
    work_item."issueTypeName"
  FROM "WorkItem" AS work_item
  WHERE work_item."issueTypeName" IS NOT NULL
  ORDER BY work_item."scopeId", work_item."issueTypeId", work_item."updatedAt" DESC
),
scope_issue_type_names AS (
  SELECT
    scope."id" AS "scopeId",
    COALESCE(
      array_agg(
        COALESCE(latest_name."issueTypeName", selected.issue_type_id)
        ORDER BY selected.ordinality
      ) FILTER (WHERE selected.issue_type_id IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS "includedIssueTypeNames"
  FROM "FlowScope" AS scope
  LEFT JOIN LATERAL unnest(scope."includedIssueTypeIds") WITH ORDINALITY AS selected(issue_type_id, ordinality) ON TRUE
  LEFT JOIN latest_issue_type_names AS latest_name
    ON latest_name."scopeId" = scope."id"
   AND latest_name."issueTypeId" = selected.issue_type_id
  GROUP BY scope."id"
)
UPDATE "FlowScope" AS scope
SET "includedIssueTypeNames" = scope_issue_type_names."includedIssueTypeNames"
FROM scope_issue_type_names
WHERE scope."id" = scope_issue_type_names."scopeId";
