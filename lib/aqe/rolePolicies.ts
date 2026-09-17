export type AqeRole = "customer" | "manager" | "admin";

export const rolePermissions: Record<AqeRole, string[]> = {
  customer: [
    "profile.read.own",
    "booking.create",
    "comment.write",
    "chat.send",
    "support.create",
  ],
  manager: [
    "profile.read.all",
    "booking.manage",
    "payment.review",
    "withdrawal.review",
    "moderation.manage",
    "audit.read",
  ],
  admin: ["*"],
};

export function hasRolePermission(
  role: AqeRole | string | null | undefined,
  permission: string,
) {
  const normalized = String(role ?? "").toLowerCase();
  const permissions = rolePermissions[normalized as AqeRole] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requireAllowedRole(
  role: AqeRole | string | null | undefined,
  allowed: AqeRole[],
) {
  const normalized = String(role ?? "").toLowerCase() as AqeRole;
  return allowed.includes(normalized);
}
