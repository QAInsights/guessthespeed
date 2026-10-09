export function hasDistinctRole(name: string, role: string): boolean {
  const normalizedRole = role.trim().toLowerCase();
  return (
    normalizedRole.length > 0 && name.trim().toLowerCase() !== normalizedRole
  );
}
