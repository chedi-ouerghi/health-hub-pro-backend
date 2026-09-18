import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { renderVerifyEmail } from '../../mail/templates/verify-email.template';
import { renderPasswordResetEmail } from '../../mail/templates/reset-password.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend?: Resend;
  private readonly from?: string;
  private readonly frontendUrl: string;
  private readonly logoUrl: string;

  constructor(private readonly config: ConfigService) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    this.logoUrl =
      config.get<string>('BRAND_LOGO_URL') ??
      'https://health-hub-pro-backend.onrender.com/assets/logo.png';
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.from = config.get<string>('RESEND_FROM_EMAIL');
    }
  }

  get isConfigured(): boolean {
    return !!this.resend && !!this.from;
  }

  async sendVerificationEmail(
    to: string,
    rawToken: string,
    opts?: { firstName?: string | null },
  ): Promise<boolean> {
    const link = `${this.frontendUrl}/verify-email?token=${rawToken}`;
    return this._send(
      to,
      'Confirmez votre adresse email — Health Hub Pro',
      renderVerifyEmail({
        firstName: opts?.firstName,
        verificationUrl: link,
        logoUrl: this.logoUrl,
      }),
    );
  }

  async sendPasswordResetEmail(
    to: string,
    rawToken: string,
    opts?: { firstName?: string | null },
  ): Promise<boolean> {
    const link = `${this.frontendUrl}/reset-password?token=${rawToken}`;
    return this._send(
      to,
      'Réinitialisation de votre mot de passe — Health Hub Pro',
      renderPasswordResetEmail({
        firstName: opts?.firstName,
        resetUrl: link,
        logoUrl: this.logoUrl,
      }),
    );
  }

  private async _send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend || !this.from) {
      this.logger.warn(
        `[MAIL_DISABLED] RESEND_API_KEY / RESEND_FROM_EMAIL non configurés — email non envoyé à ${to} (${subject})`,
      );
      return false;
    }

    const { error } = await this.resend.emails.send({ from: this.from, to, subject, html });
    if (error) {
      this.logger.error(`Resend send failed (${subject} → ${to}): ${error.message}`);
      return false;
    }

    this.logger.log(`Email sent (${subject} → ${to})`);
    return true;
  }
}