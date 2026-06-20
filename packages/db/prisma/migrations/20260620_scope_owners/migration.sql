CREATE TYPE "FlowScopeUserRole" AS ENUM (
  'owner'
);

CREATE TABLE "FlowScopeUserRoleAssignment" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "workspaceUserId" TEXT NOT NULL,
  "role" "FlowScopeUserRole" NOT NULL DEFAULT 'owner',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedBy" TEXT,
  CONSTRAINT "FlowScopeUserRoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceUser_workspaceId_id_key"
  ON "WorkspaceUser"("workspaceId", "id");

CREATE UNIQUE INDEX "FlowScope_workspaceId_id_key"
  ON "FlowScope"("workspaceId", "id");

CREATE UNIQUE INDEX "FlowScopeUserRoleAssignment_scopeId_workspaceUserId_role_key"
  ON "FlowScopeUserRoleAssignment"("scopeId", "workspaceUserId", "role");

CREATE INDEX "FlowScopeUserRoleAssignment_workspaceId_workspaceUserId_role_idx"
  ON "FlowScopeUserRoleAssignment"("workspaceId", "workspaceUserId", "role");

CREATE INDEX "FlowScopeUserRoleAssignment_workspaceId_scopeId_role_idx"
  ON "FlowScopeUserRoleAssignment"("workspaceId", "scopeId", "role");

ALTER TABLE "FlowScopeUserRoleAssignment"
  ADD CONSTRAINT "FlowScopeUserRoleAssignment_workspaceId_scopeId_fkey"
  FOREIGN KEY ("workspaceId", "scopeId") REFERENCES "FlowScope"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlowScopeUserRoleAssignment"
  ADD CONSTRAINT "FlowScopeUserRoleAssignment_workspaceId_workspaceUserId_fkey"
  FOREIGN KEY ("workspaceId", "workspaceUserId") REFERENCES "WorkspaceUser"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
