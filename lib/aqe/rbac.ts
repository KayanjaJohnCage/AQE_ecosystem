export type RoleName = "customer" | "manager" | "admin";

export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  customer: [
    "view_own_profile",
    "create_booking",
    "comment_on_profile",
    "submit_support_ticket",
  ],
  manager: [
    "view_dashboard",
    "moderate_media",
    "review_bookings",
    "approve_payments",
    "manage_users",
  ],
  admin: ["*"],
};

export function hasPermission(role: RoleName, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requireRole(
  userRole: RoleName | null | undefined,
  allowedRoles: RoleName[],
): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}
