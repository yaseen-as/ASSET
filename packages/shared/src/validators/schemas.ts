import { z } from 'zod';

// ─── Auth Schemas ───

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  phone: z.string().regex(/^\+91[0-9]{10}$/, 'Phone must be a valid Indian number (+91XXXXXXXXXX)'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+91[0-9]{10}$/),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── User Schemas ───

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  timezone: z.string().optional(),
  preferences: z
    .object({
      theme: z.enum(['light', 'dark']).optional(),
      defaultWatchlistId: z.string().uuid().optional(),
      notificationEmail: z.boolean().optional(),
      notificationInApp: z.boolean().optional(),
    })
    .optional(),
});

// ─── Broker Schemas ───

export const connectBrokerSchema = z.object({
  brokerName: z.enum(['angel_one']),
  clientId: z.string().min(1, 'Client ID is required'),
  password: z.string().min(1, 'Password is required'),
  totp: z.string().length(6, 'TOTP must be 6 digits'),
});

export const toggleBrokerSchema = z.object({
  isActive: z.boolean(),
});

export const placeOrderSchema = z.object({
  connectionId: z.string().uuid(),
  symbol: z.string().min(1).max(20),
  exchange: z.enum(['NSE', 'BSE']),
  action: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
  price: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  productType: z.enum(['DELIVERY', 'INTRADAY']).optional().default('DELIVERY'),
});

// ─── Market Data Schemas ───

export const historicalDataSchema = z.object({
  interval: z.enum(['1m', '5m', '15m', '30m', '1h', '1d', '1w']),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const indicatorQuerySchema = z.object({
  indicators: z.string().min(1), // comma-separated indicator names
});

// ─── Portfolio Schemas ───

export const createWatchlistSchema = z.object({
  name: z.string().min(1).max(100),
  symbols: z
    .array(
      z.object({
        symbol: z.string().min(1).max(20),
        exchange: z.enum(['NSE', 'BSE']),
      })
    )
    .min(1)
    .max(50),
});

export const updateWatchlistSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  symbols: z
    .array(
      z.object({
        symbol: z.string().min(1).max(20),
        exchange: z.enum(['NSE', 'BSE']),
      })
    )
    .max(50)
    .optional(),
});

// ─── Alert Schemas ───

export const createAlertSchema = z.object({
  symbol: z.string().min(1).max(20),
  exchange: z.enum(['NSE', 'BSE']),
  alertType: z.enum(['price', 'volume', 'indicator', 'corporate_action']),
  condition: z.object({
    operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'crosses_above', 'crosses_below']),
    value: z.number(),
    indicator: z.string().optional(),
  }),
});

export const updateAlertSchema = z.object({
  isActive: z.boolean().optional(),
});

// ─── Pagination Schema ───

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
