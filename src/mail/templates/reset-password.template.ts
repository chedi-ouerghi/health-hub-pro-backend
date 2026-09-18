/**
 * Modern HTML email template for the password-reset email.
 * Same design language as verify-email.template.ts.
 * Email-client safe: HTML tables, inline styles, max-width 600px.
 */

export interface PasswordResetTemplateData {
  firstName?: string | null;
  resetUrl: string;
  logoUrl?: string;
}

const DEFAULT_LOGO_URL = 'https://health-hub-pro-backend.onrender.com/assets/logo.png';

export function renderPasswordResetEmail({
  firstName,
  resetUrl,
  logoUrl = DEFAULT_LOGO_URL,
}: PasswordResetTemplateData): string {
  const salutation =
    firstName && firstName.trim() ? `Bonjour ${firstName.trim()},` : 'Bonjour,';
  const escapedUrl = resetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const escapedLogo = logoUrl.replace(/&/g, '&amp;');

  return `
<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Réinitialisation de votre mot de passe</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(23,32,51,0.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:36px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <img src="${escapedLogo}" alt="Health Hub Pro" width="48" height="48" style="display:block;width:48px;height:48px;border:0;border-radius:10px;" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:20px;font-weight:bold;color:#1d4ed8;letter-spacing:0.2px;">Health&nbsp;Hub&nbsp;Pro</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:10px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- Hero band -->
          <tr>
            <td bgcolor="#1d4ed8" style="background-color:#1d4ed8;padding:24px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;font-size:22px;line-height:1.3;font-weight:bold;color:#ffffff;text-align:center;">Réinitialisation du mot de passe</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#172033;">${salutation}</p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#172033;">
                Vous avez demandé à réinitialiser le mot de passe de votre compte <strong>Health Hub Pro</strong>.
                Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
              </p>
              <!-- CTA button (table-based for Outlook) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px 0;">
                <tr>
                  <td bgcolor="#1d4ed8" align="center" style="border-radius:8px;">
                    <a href="${escapedUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Réinitialiser mon mot de passe</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#5d687a;text-align:center;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br />
                <a href="${escapedUrl}" style="color:#1d4ed8;word-break:break-all;">${escapedUrl}</a>
              </p>
              <p style="margin:0 0 28px 0;font-size:13px;line-height:1.5;color:#5d687a;text-align:center;">
                ⏱ Ce lien expire dans <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette
                demande, ignorez simplement cet email&nbsp;: votre mot de passe actuel reste inchangé.
              </p>
              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5eaf3;">
                <tr><td style="height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#8a94a6;text-align:center;">
                Health Hub Pro — Plateforme de prise de rendez-vous médicaux en présentiel.
              </p>
              <p style="margin:0 0 14px 0;font-size:11px;line-height:1.5;color:#8a94a6;text-align:center;">
                Cet email a été envoyé à l'adresse associée à votre compte Health Hub Pro.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px auto;">
                <tr>
                  <td style="padding:0 8px;"><a href="https://www.facebook.com/healthhubpro" style="font-size:12px;color:#1d4ed8;text-decoration:none;">Facebook</a></td>
                  <td style="color:#e5eaf3;font-size:12px;">&bull;</td>
                  <td style="padding:0 8px;"><a href="https://twitter.com/healthhubpro" style="font-size:12px;color:#1d4ed8;text-decoration:none;">X&nbsp;(Twitter)</a></td>
                  <td style="color:#e5eaf3;font-size:12px;">&bull;</td>
                  <td style="padding:0 8px;"><a href="https://www.linkedin.com/company/healthhubpro" style="font-size:12px;color:#1d4ed8;text-decoration:none;">LinkedIn</a></td>
                </tr>
              </table>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#a7b0c0;text-align:center;">
                Vous recevez cet email car une demande de réinitialisation a été initiée avec cette adresse.
                <a href="https://health-hub-pro.com/unsubscribe" style="color:#a7b0c0;">Se désabonner</a> &bull;
                <a href="https://health-hub-pro.com/politique-de-confidentialite" style="color:#a7b0c0;">Politique de confidentialité</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:11px;color:#a7b0c0;text-align:center;">
          &copy; ${new Date().getFullYear()} Health Hub Pro — Tous droits réservés.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}