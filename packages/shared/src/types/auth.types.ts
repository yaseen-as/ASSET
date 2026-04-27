// ─── Auth Types ───

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface VerifyOtpDTO {
  phone: string;
  otp: string;
}

export interface RefreshTokenDTO {
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface LogoutDTO {
  refreshToken: string;
}
