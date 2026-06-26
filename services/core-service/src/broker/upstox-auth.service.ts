import axios from 'axios';
import { BrokerConnectionRepository } from './broker.repository';
import * as upstoxClient from './upstox.client';
import { encrypt } from '../utils/encryption';
import { config } from '../config';
import { logger } from '../utils/logger';

export class UpstoxAuthService {
  private repo = new BrokerConnectionRepository();

  /**
   * Build the Upstox OAuth authorization URL.
   * The frontend opens this URL in a browser tab so the user can log in.
   * `state` carries the userId — Upstox echoes it back in the callback.
   */
  buildAuthUrl(userId: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.upstox.clientId,
      redirect_uri: config.upstox.redirectUri,
      state: userId,
    });
    return `${config.upstox.authUrl}?${params}`;
  }

  /**
   * Exchange the authorization code for an access token, fetch the Upstox
   * user profile, then upsert the connection row with encrypted tokens.
   */
  async handleCallback(code: string, userId: string): Promise<void> {
    logger.info(`[UpstoxAuth] Exchanging code for userId=${userId}`);

    const tokenResponse = await axios.post(
      config.upstox.tokenUrl,
      new URLSearchParams({
        code,
        client_id: config.upstox.clientId,
        client_secret: config.upstox.clientSecret,
        redirect_uri: config.upstox.redirectUri,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
    );

    const { access_token, expires_in } = tokenResponse.data;
    if (!access_token) {
      throw new Error('Upstox token exchange failed — no access_token in response');
    }

    // Fetch user profile to store broker_user_id
    const profile = await upstoxClient.getUserProfile(access_token);

    await this.repo.upsert(userId, 'upstox', {
      broker_user_id: encrypt(profile.userId || userId),
      access_token: encrypt(access_token),
      refresh_token: null,        // Upstox daily tokens have no refresh token
      expires_at: new Date(Date.now() + (expires_in || 86400) * 1000),
      token_expiry: new Date(Date.now() + (expires_in || 86400) * 1000),
      is_active: true,
    });

    logger.info(`[UpstoxAuth] Broker connected for userId=${userId}, upstoxUserId=${profile.userId}`);
  }

  /**
   * Check if a user has an active, non-expired Upstox connection.
   */
  async getStatus(userId: string): Promise<{ connected: boolean; broker: string | null; expiresAt: Date | null }> {
    const conn = await this.repo.findActiveByUserId(userId);
    if (!conn) {
      return { connected: false, broker: null, expiresAt: null };
    }

    const expired = conn.expires_at && new Date(conn.expires_at) < new Date();
    return {
      connected: !expired,
      broker: conn.broker_name,
      expiresAt: conn.expires_at,
    };
  }

  /**
   * Connects a user to the Upstox sandbox environment.
   */
  async connectSandbox(userId: string): Promise<void> {

    const token = config.upstox.sandboxToken;
    // const profile = await upstoxClient.getUserProfile(token);

    await this.repo.upsert(userId, 'upstox', {
        broker_user_id: encrypt(userId),
        access_token: encrypt(token),
        refresh_token: null,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        token_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        is_active: true,
    });
}
}
