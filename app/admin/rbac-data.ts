import { AdminApiError, adminApiRequest } from "./admin-api";

export type RbacRole = { id: string; key: string; name: string };
export type RbacPermission = { key: string; description?: string; high_risk?: boolean };
export type RbacAdmin = { id: string; display_name: string; version: number; roles: RbacRole[] };
type Request = typeof adminApiRequest;

function invalidResponse(): never {
  throw new AdminApiError("角色数据不完整，请重新加载后再修改", "RBAC_RESPONSE_INVALID", 422);
}
function isRole(value: unknown): value is RbacRole {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.key === "string" && typeof row.name === "string";
}

/** Do not publish partial options: every page must succeed before saving is enabled. */
export async function loadRbacOptions(signal: AbortSignal, request: Request = adminApiRequest) {
  const rolesRequest = (async () => {
    const roles = new Map<string, RbacRole>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const page: { items: unknown[]; next_cursor: string | null } = await request(`/rbac/roles?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });
      if (!Array.isArray(page.items) || !page.items.every(isRole) || !(page.next_cursor === null || typeof page.next_cursor === "string")) invalidResponse();
      for (const role of page.items) roles.set(role.id, role);
      cursor = page.next_cursor;
      if (cursor && (cursors.has(cursor) || roles.size > 10_000)) invalidResponse();
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return [...roles.values()];
  })();
  const [roles, permissions] = await Promise.all([rolesRequest, request<RbacPermission[]>("/rbac/permissions", { signal })]);
  if (!Array.isArray(permissions) || permissions.some(row => !row || typeof row.key !== "string")) invalidResponse();
  return { roles, permissions };
}

export async function loadRbacAdmin(id: string, roles: RbacRole[], signal: AbortSignal, request: Request = adminApiRequest): Promise<RbacAdmin> {
  const admin = await request<RbacAdmin>(`/rbac/admins/${encodeURIComponent(id)}`, { signal });
  if (admin.id !== id || !Number.isSafeInteger(admin.version) || admin.version < 0 || !Array.isArray(admin.roles) || !admin.roles.every(isRole)) invalidResponse();
  const known = new Set(roles.map(role => role.id));
  if (admin.roles.some(role => !known.has(role.id))) invalidResponse();
  return admin;
}

export function sameRoleIds(left: Iterable<string>, right: Iterable<string>) {
  const a = new Set(left); const b = new Set(right);
  return a.size === b.size && [...a].every(id => b.has(id));
}
