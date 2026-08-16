import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

interface PendingCode {
  code: string;
  expiresAt: number;
  lastSentAt: number;
}

/**
 * Phone-verification SMS service.
 *
 * - When TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER are set,
 *   codes are sent through the Twilio REST API (no SDK dependency).
 * - Otherwise (dev / tests) the code is only logged — the caller exposes it in
 *   the response when NODE_ENV !== 'production', mirroring the existing
 *   verification-token pattern.
 *
 * Codes are held in-memory (single instance) — acceptable for a MVP; plug a
 * Redis-backed store behind this interface for horizontal scaling.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly pending = new Map<string, PendingCode>();

  constructor(private readonly config: ConfigService) {}

  private get twilioConfigured(): boolean {
    return Boolean(
      this.config.get('TWILIO_ACCOUNT_SID') &&
        this.config.get('TWILIO_AUTH_TOKEN') &&
        this.config.get('TWILIO_FROM_NUMBER'),
    );
  }

  /** Generate, store and (try to) send a 6-digit code for a user. Returns the raw code. */
  async requestCode(userId: string, phone: string): Promise<string> {
    const existing = this.pending.get(userId);
    if (existing && Date.now() - existing.lastSentAt < RESEND_COOLDOWN_MS) {
      throw new BadRequestException('Please wait before requesting another code');
    }

    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    this.pending.set(userId, { code, expiresAt: Date.now() + CODE_TTL_MS, lastSentAt: Date.now() });

    if (this.twilioConfigured) {
      await this._sendViaTwilio(phone, `Votre code de vérification Health Hub Pro : ${code}`);
    } else {
      this.logger.warn(`[DEV] Phone verification code for ${phone}: ${code}`);
    }

    return code;
  }

  /** Validate a code and consume it on success. */
  verifyCode(userId: string, code: string): boolean {
    const entry = this.pending.get(userId);
    if (!entry || entry.expiresAt < Date.now()) return false;
    const ok = entry.code === code;
    this.pending.delete(userId); // single-use
    return ok;
  }

  private async _sendViaTwilio(phone: string, body: string): Promise<void> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID')!;
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN')!;
    const from = this.config.get<string>('TWILIO_FROM_NUMBER')!;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: from, Body: body }).toString(),
    });

    if (!res.ok) {
      this.logger.error(`Twilio send failed: ${res.status} ${await res.text()}`);
    }
  }
}