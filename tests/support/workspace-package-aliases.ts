import path from 'node:path';

function toImportPath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

export interface WorkspacePackageAlias {
  find: RegExp;
  replacement: string;
}

export function createWorkspacePackageAliases(repoRoot: string): WorkspacePackageAlias[] {
  return [
    {
      find: /^@agile-tools\/shared$/,
      replacement: toImportPath(path.resolve(repoRoot, 'packages/shared/src/index.ts')),
    },
    {
      find: /^@agile-tools\/shared\/contracts\/(.+)$/,
      replacement: toImportPath(path.resolve(repoRoot, 'packages/shared/src/contracts/$1.ts')),
    },
    {
      find: /^@agile-tools\/db$/,
      replacement: toImportPath(path.resolve(repoRoot, 'packages/db/src/index.ts')),
    },
    {
      find: /^@agile-tools\/analytics$/,
      replacement: toImportPath(path.resolve(repoRoot, 'packages/analytics/src/index.ts')),
    },
    {
      find: /^@agile-tools\/jira-client$/,
      replacement: toImportPath(path.resolve(repoRoot, 'packages/jira-client/src/index.ts')),
    },
  ];
}