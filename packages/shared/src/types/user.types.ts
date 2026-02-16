// ─── User Types ───

export interface User {
  id: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  timezone: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  defaultWatchlistId?: string;
  notificationEmail: boolean;
  notificationInApp: boolean;
}

export interface CreateUserDTO {
  email: string;
  password: string;
  phone: string;
}

export interface UpdateProfileDTO {
  displayName?: string;
  avatarUrl?: string;
  timezone?: string;
  preferences?: Partial<UserPreferences>;
}
