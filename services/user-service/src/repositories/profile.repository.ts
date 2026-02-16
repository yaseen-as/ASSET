import { db } from '../config/database';

interface ProfileRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class ProfileRepository {
  private table = 'users.profiles';

  async findByUserId(userId: string): Promise<ProfileRow | undefined> {
    return db(this.table).where({ user_id: userId }).first();
  }

  async create(userId: string, data: Partial<ProfileRow>): Promise<ProfileRow> {
    const [profile] = await db(this.table)
      .insert({
        user_id: userId,
        display_name: data.display_name || '',
        avatar_url: data.avatar_url || null,
        timezone: data.timezone || 'Asia/Kolkata',
        preferences: JSON.stringify(data.preferences || {}),
      })
      .returning('*');
    return profile;
  }

  async update(userId: string, data: Partial<ProfileRow>): Promise<ProfileRow> {
    const updateData: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.display_name !== undefined) updateData.display_name = data.display_name;
    if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.preferences !== undefined) updateData.preferences = JSON.stringify(data.preferences);

    const [profile] = await db(this.table)
      .where({ user_id: userId })
      .update(updateData)
      .returning('*');
    return profile;
  }

  async upsert(userId: string, data: Partial<ProfileRow>): Promise<ProfileRow> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return this.update(userId, data);
    }
    return this.create(userId, data);
  }
}
