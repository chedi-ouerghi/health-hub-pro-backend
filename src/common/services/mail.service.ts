import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend?: Resend;
  private readonly from?: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.frontendUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.from = config.get<string>('RESEND_FROM_EMAIL');
    }
  }

  get isConfigured(): boolean {
    return !!this.resend && !!this.from;
  }

  async sendVerificationEmail(to: string, rawToken: string): Promise<boolean> {
    const link = `${this.frontendUrl}/verify-email?token=${rawToken}`;
    return this._send(
      to,
      'Confirmez votre adresse email — Health Hub Pro',
      `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border-radius:12px"><h1 style="margin:0 0 16px;font-size:22px">Bienvenue sur Health Hub Pro</h1><p style="font-size:15px;line-height:1.5">Pour activer votre compte, confirmez votre adresse email en cliquant sur le bouton ci-dessous :</p><div style="margin:24px 0;text-align:center"><a href="${link}" style="display:inline-block;padding:14px 28px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Confirmer mon adresse email</a></div><p style="font-size:13px;color:#5d687a">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>${link}</p><p style="font-size:13px;color:#5d687a">Ce lien expire dans 24 heures.</p></div></body></html>`,
    );
  }

  async sendPasswordResetEmail(to: string, rawToken: string): Promise<boolean> {
    const link = `${this.frontendUrl}/reset-password?token=${rawToken}`;
    return this._send(
      to,
      'Réinitialisation de votre mot de passe — Health Hub Pro',
      `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border-radius:12px"><h1 style="margin:0 0 16px;font-size:22px">Réinitialisation du mot de passe</h1><p style="font-size:15px;line-height:1.5">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :</p><div style="margin:24px 0;text-align:center"><a href="${link}" style="display:inline-block;padding:14px 28px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Réinitialiser mon mot de passe</a></div><p style="font-size:13px;color:#5d687a">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>${link}</p><p style="font-size:13px;color:#5d687a">Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p></div></body></html>`,
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