import type { RequestHandler } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';

export function helmetMiddleware(): RequestHandler {
  return helmet();
}

export function corsMiddleware(opts?: CorsOptions): RequestHandler {
  return cors(opts);
}
