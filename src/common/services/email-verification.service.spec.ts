import { BadRequestException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }) },
  })),
}));

describe('EmailVerificationService', () => {
  const config = {
    get: jest.fn((key: string) =>
      ({ RESEND_API_KEY: 're_test_key', RESEND_FROM_EMAIL: 'no-reply@example.com' })[key],
    ),
  };
  const prisma = {
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores and sends a six-digit code through Resend', async () => {
    prisma.user.update.mockResolvedValue({});
    const service = new EmailVerificationService(prisma as never, config as never);

    const code = await service.requestCode('user-1', 'patient@example.com');

    expect(code).toMatch(/^\d{6}$/);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        emailVerificationCode: code,
        emailVerificationExpiresAt: expect.any(Date),
      }),
    });
  });

  it('consumes a valid code and clears the stored OTP', async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailVerificationCode: '123456',
      emailVerificationExpiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.update.mockResolvedValue({});
    const service = new EmailVerificationService(prisma as never, config as never);

    await expect(service.verifyCode('user-1', '123456')).resolves.toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerificationCode: null, emailVerificationExpiresAt: null },
    });
  });

  it('rejects a second request during the cooldown', async () => {
    prisma.user.update.mockResolvedValue({});
    const service = new EmailVerificationService(prisma as never, config as never);
    await service.requestCode('user-1', 'patient@example.com');

    await expect(service.requestCode('user-1', 'patient@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
