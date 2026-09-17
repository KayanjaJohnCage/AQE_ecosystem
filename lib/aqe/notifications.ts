export type NotificationKind =
  | "financial"
  | "booking"
  | "reward"
  | "moderation"
  | "system";

export function createNotification({
  userId,
  kind,
  title,
  message,
  read = false,
}: {
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  read?: boolean;
}) {
  return {
    id: `notification-${Date.now()}`,
    userId,
    kind,
    title,
    message,
    read,
    createdAt: new Date().toISOString(),
  };
}
