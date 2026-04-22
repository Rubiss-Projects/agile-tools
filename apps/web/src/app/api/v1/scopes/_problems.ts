export function buildInvalidScopeTimezoneProblem(timezone: string) {
  return {
    code: 'INVALID_SCOPE_TIMEZONE',
    message:
      `This scope uses an unsupported timezone identifier ("${timezone}"). ` +
      'Update the scope timezone to a valid value such as UTC or America/New_York.',
  };
}
