import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PLACEHOLDER_KEYS = [
  'your_turnstile_secret_key',
  '0x4AAAAAAA-lalaland_secret_key',
];

@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);
  private readonly secretKey: string;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.secretKey = config.get('TURNSTILE_SECRET_KEY') ?? '';
    this.enabled = !!(this.secretKey && !PLACEHOLDER_KEYS.includes(this.secretKey));
    if (!this.enabled) {
      this.logger.warn('Turnstile CAPTCHA is DISABLED — set a valid TURNSTILE_SECRET_KEY in .env');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.body?.cfTurnstileToken;

    if (!token) {
      throw new HttpException('CAPTCHA token is required', HttpStatus.FORBIDDEN);
    }

    const formData = new URLSearchParams();
    formData.append('secret', this.secretKey);
    formData.append('response', token);

    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as { success: boolean; [key: string]: unknown };

      if (!data.success) {
        throw new HttpException('CAPTCHA verification failed', HttpStatus.FORBIDDEN);
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('CAPTCHA verification error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
