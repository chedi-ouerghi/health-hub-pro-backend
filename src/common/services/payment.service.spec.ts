import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';

const createPaymentIntent = jest.fn();
const constructEvent = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    paymentIntents: { create: createPaymentIntent },
    webhooks: { constructEvent },
  })),
}));

describe('PaymentService', () => {
  const prisma = {
    invoice: { update: jest.fn(), updateMany: jest.fn() },
  };

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
    jest.clearAllMocks();
  });

  it('creates a test PaymentIntent and stores its ID', async () => {
    createPaymentIntent.mockResolvedValue({ id: 'pi_test', client_secret: 'pi_test_secret' });
    const service = new PaymentService(prisma as any);

    await expect(service.createPaymentIntent('inv-1', '12.50', 'EUR')).resolves.toEqual({
      paymentIntentId: 'pi_test',
      clientSecret: 'pi_test_secret',
    });
    expect(createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amount: 1250, currency: 'eur' }));
    expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv-1' } }));
  });

  it('rejects an invalid amount without calling Stripe', async () => {
    const service = new PaymentService(prisma as any);
    await expect(service.createPaymentIntent('inv-1', 0, 'EUR')).rejects.toBeInstanceOf(BadRequestException);
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  it('marks the matching invoice paid from a verified webhook', async () => {
    constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test', metadata: { invoiceId: 'inv-1' } } },
    });
    const service = new PaymentService(prisma as any);

    await expect(service.handleWebhook(Buffer.from('{}'), 'signature')).resolves.toEqual({ received: true });
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'inv-1', stripePaymentIntentId: 'pi_test' },
      data: expect.objectContaining({ status: 'PAID' }),
    }));
  });

  it('rejects an invalid webhook signature', async () => {
    constructEvent.mockImplementation(() => { throw new Error('invalid'); });
    const service = new PaymentService(prisma as any);
    await expect(service.handleWebhook(Buffer.from('{}'), 'bad')).rejects.toBeInstanceOf(BadRequestException);
  });
});