import { ProfileRepository } from '../repositories/profile.repository';
import type { UserProfile, UpdateProfileDTO } from '@platform/shared';

export class UserService {
  private profileRepo = new ProfileRepository();

  async getProfile(userId: string): Promise<UserProfile | null> {
    const row = await this.profileRepo.findByUserId(userId);
    if (!row) return null;
    return this.mapToProfile(row);
  }

  async updateProfile(userId: string, data: UpdateProfileDTO): Promise<UserProfile> {
    const row = await this.profileRepo.upsert(userId, {
      display_name: data.displayName,
      avatar_url: data.avatarUrl,
      timezone: data.timezone,
      preferences: data.preferences as Record<string, unknown>,
    });
    return this.mapToProfile(row);
  }

  private mapToProfile(row: Record<string, unknown>): UserProfile {
    return {
      userId: row.user_id as string,
      displayName: (row.display_name as string) || '',
      avatarUrl: row.avatar_url as string | undefined,
      timezone: (row.timezone as string) || 'Asia/Kolkata',
      preferences: (row.preferences || {}) as UserProfile['preferences'],
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}
