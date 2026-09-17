import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';

// MODE TEST UNIQUEMENT — ne jamais utiliser de clés sk_live_ sans validation manuelle
@Injectable()
export class PaymentService {
    private readonly stripe: Stripe;

    constructor(private readonly prisma: PrismaService) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey || !secretKey.startsWith('sk_test_')) {
            throw new InternalServerErrorException('Stripe test secret key is required');
        }
        this.stripe = new Stripe(secretKey);
    }

    async createPaymentIntent(invoiceId: string, amount: number | string, currency: string) {
        const amountInMinorUnits = Math.round(Number(amount) * 100);
        if (!Number.isSafeInteger(amountInMinorUnits) || amountInMinorUnits <= 0) {
            throw new BadRequestException('Invalid payment amount');
        }
        const intent = await this.stripe.paymentIntents.create({
            amount: amountInMinorUnits,
            currency: currency.toLowerCase(),
            automatic_payment_methods: { enabled: true },
            metadata: { invoiceId },
        });
        if (!intent.client_secret) throw new InternalServerErrorException('Stripe did not return a client secret');
        await this.prisma.invoice.update({
            where: { id: invoiceId },
            data: { stripePaymentIntentId: intent.id, paymentMethod: 'stripe' },
        });
        return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
    }

    async handleWebhook(rawBody: Buffer, signature: string) {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) throw new InternalServerErrorException('Stripe webhook secret is required');
        let event: Stripe.Event;
        try {
            event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
        } catch {
            throw new BadRequestException('Invalid Stripe webhook signature');
        }
        if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
            const intent = event.data.object as Stripe.PaymentIntent;
            const invoiceId = intent.metadata.invoiceId;
            if (invoiceId) {
                await this.prisma.invoice.updateMany({
                    where: { id: invoiceId, stripePaymentIntentId: intent.id },
                    data: event.type === 'payment_intent.succeeded'
                        ? { status: 'PAID', paidAt: new Date() }
                        : { status: 'FAILED' },
                });
            }
        }
        return { received: true };
    }
}
