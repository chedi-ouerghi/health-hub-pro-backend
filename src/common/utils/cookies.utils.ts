import type { Response } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15m
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30d

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Sets httpOnly auth cookies on the response.
 * The refresh cookie is scoped to the /api/v1/auth path so it is only
 * sent to auth endpoints, never to regular API calls.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/auth' });
}
