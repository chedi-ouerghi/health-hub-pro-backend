import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

/**
 * Rate-limit strategy:
 * - Public routes (no auth user): key = IP address → per-IP limiting
 * - Authenticated routes (userId present): key = `user:{userId}` → per-user limiting
 *   (prevents NAT issues where Admin share the same club IP)
 * - IP whitelist via RATE_LIMIT_WHITELIST env var (comma-separated) bypasses limits
 *   (intended for club Admin LAN / fixed admin IPs)
 *
 * Default limits are set per-route via @Throttle() decorator.
 * Global defaults fall back to @nestjs/throttler module config in app.module.ts.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.sub) {
      return `user:${req.user.sub}`;
    }
    return req.ip;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const whitelist = (process.env.RATE_LIMIT_WHITELIST ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (whitelist.length > 0 && whitelist.includes(req.ip)) {
      return true;
    }
    return super.canActivate(context);
  }
}
