import { ProfileRepository } from '../repositories/profile.repository';
import type { UserProfile, UpdateProfileDTO } from '@platform/shared';

export class ProfileService {
  private profileRepo = new ProfileRepository();

  async getProfile(userId: string): Promise<(UserProfile & { paperTrading: boolean }) | null> {
    const row = await this.profileRepo.findByUserId(userId);
    if (!row) return null;
    return this.mapToProfile(row);
  }

  async updateProfile(userId: string, data: UpdateProfileDTO & { paperTrading?: boolean }): Promise<UserProfile & { paperTrading: boolean }> {
    const updateData: Record<string, unknown> = {};
    if (data.displayName !== undefined) updateData.display_name = data.displayName;
    if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.preferences !== undefined) updateData.preferences = data.preferences;
    if (data.paperTrading !== undefined) updateData.paper_trading = data.paperTrading;

    const row = await this.profileRepo.upsert(userId, updateData);
    return this.mapToProfile(row);
  }

  private mapToProfile(row: Record<string, unknown>): UserProfile & { paperTrading: boolean } {
    return {
      userId: row.user_id as string,
      displayName: (row.display_name as string) || '',
      avatarUrl: row.avatar_url as string | undefined,
      timezone: (row.timezone as string) || 'Asia/Kolkata',
      preferences: (row.preferences || {}) as UserProfile['preferences'],
      paperTrading: (row.paper_trading as boolean) || false,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}
