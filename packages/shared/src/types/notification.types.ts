// ─── Notification Types ───

export type NotificationType = 'alert_triggered' | 'order_executed' | 'recommendation' | 'system';
export type NotificationChannel = 'in_app' | 'email';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  channel: NotificationChannel;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateNotificationDTO {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  channel: NotificationChannel;
  metadata?: Record<string, unknown>;
}
