import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  phone: string;
  phone_verified: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
}

interface OtpRow {
  id: string;
  phone: string;
  code: string;
  attempts: number;
  verified: boolean;
  expires_at: Date;
  created_at: Date;
}

export class UserRepository {
  private table = 'auth.users';

  async create(email: string, passwordHash: string, phone: string): Promise<UserRow> {
    const [user] = await db(this.table)
      .insert({ email, password_hash: passwordHash, phone })
      .returning('*');
    return user;
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    return db(this.table).where({ email }).first();
  }

  async findById(id: string): Promise<UserRow | undefined> {
    return db(this.table).where({ id }).first();
  }

  async findByPhone(phone: string): Promise<UserRow | undefined> {
    return db(this.table).where({ phone }).first();
  }

  async setPhoneVerified(phone: string): Promise<void> {
    await db(this.table).where({ phone }).update({ phone_verified: true, updated_at: db.fn.now() });
  }
}

export class RefreshTokenRepository {
  private table = 'auth.refresh_tokens';

  async create(userId: string, tokenHash: string, familyId: string, expiresAt: Date): Promise<RefreshTokenRow> {
    const [token] = await db(this.table)
      .insert({
        user_id: userId,
        token_hash: tokenHash,
        family_id: familyId,
        expires_at: expiresAt,
      })
      .returning('*');
    return token;
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    return db(this.table).where({ token_hash: tokenHash }).first();
  }

  async revoke(id: string): Promise<void> {
    await db(this.table).where({ id }).update({ revoked: true });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await db(this.table).where({ family_id: familyId }).update({ revoked: true });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await db(this.table).where({ user_id: userId }).update({ revoked: true });
  }

  async deleteExpired(): Promise<number> {
    return db(this.table).where('expires_at', '<', db.fn.now()).del();
  }
}

export class OtpRepository {
  private table = 'auth.otp_codes';

  async create(phone: string, code: string, expiresAt: Date): Promise<OtpRow> {
    const [otp] = await db(this.table)
      .insert({ phone, code, expires_at: expiresAt })
      .returning('*');
    return otp;
  }

  async findLatest(phone: string): Promise<OtpRow | undefined> {
    return db(this.table)
      .where({ phone, verified: false })
      .where('expires_at', '>', db.fn.now())
      .orderBy('created_at', 'desc')
      .first();
  }

  async markVerified(id: string): Promise<void> {
    await db(this.table).where({ id }).update({ verified: true });
  }

  async incrementAttempts(id: string): Promise<void> {
    await db(this.table).where({ id }).increment('attempts', 1);
  }
}
