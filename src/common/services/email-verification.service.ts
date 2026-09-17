import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { Resend } from 'resend';
import { PrismaService } from '../../prisma/prisma.service';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly lastSentAt = new Map<string, number>();
  private readonly resend?: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (apiKey) this.resend = new Resend(apiKey);
  }

  async requestCode(userId: string, email: string): Promise<string> {
    const lastSentAt = this.lastSentAt.get(userId);
    if (lastSentAt && Date.now() - lastSentAt < RESEND_COOLDOWN_MS) {
      throw new BadRequestException('Please wait before requesting another code');
    }

    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerificationCode: code, emailVerificationExpiresAt: expiresAt },
    });
    this.lastSentAt.set(userId, Date.now());

    if (this.resend) {
      const from = this.config.get<string>('RESEND_FROM_EMAIL');
      if (!from) throw new BadRequestException('Email verification is not configured');
      const { error } = await this.resend.emails.send({
        from,
        to: email,
        subject: 'Votre code de vérification Health Hub Pro',
        html: `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border-radius:12px"><h1 style="margin:0 0 16px;font-size:22px">Vérifiez votre adresse email</h1><p style="font-size:15px;line-height:1.5">Utilisez ce code pour confirmer votre adresse email :</p><div style="margin:24px 0;padding:18px;text-align:center;background:#eef4ff;border-radius:8px;font-size:32px;letter-spacing:8px;font-weight:700;color:#1d4ed8">${code}</div><p style="font-size:13px;color:#5d687a">Ce code expire dans 10 minutes et ne peut être utilisé qu’une seule fois.</p></div></body></html>`,
      });
      if (error) {
        this.logger.error(`Resend send failed: ${error.message}`);
        throw new BadRequestException('Unable to send verification email');
      }
    } else {
      this.logger.warn(`[DEV] Email verification code for ${email}: ${code}`);
    }

    return code;
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerificationCode: true, emailVerificationExpiresAt: true },
    });
    if (!user?.emailVerificationCode || !user.emailVerificationExpiresAt) return false;
    if (user.emailVerificationExpiresAt < new Date()) return false;

    const valid = user.emailVerificationCode === code;
    if (valid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { emailVerificationCode: null, emailVerificationExpiresAt: null },
      });
    }
    return valid;
  }
}
