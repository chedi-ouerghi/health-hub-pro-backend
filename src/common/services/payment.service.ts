import { BadRequestException } from '@nestjs/common';

type Card = {
    number: string;
    expMonth: number;
    expYear: number;
    cvc: string;
    holderName?: string;
};

// Very small, deterministic payment simulator used for tests and local dev.
// It does NOT call any external gateway and must never be used in production.
export class PaymentService {
    // Luhn check for card number basic validation
    private static luhnCheck(cardNumber: string) {
        const s = cardNumber.replace(/\D/g, '');
        let sum = 0;
        let toggle = false;
        for (let i = s.length - 1; i >= 0; i--) {
            let d = parseInt(s[i], 10);
            if (toggle) {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
            toggle = !toggle;
        }
        return sum % 10 === 0;
    }

    async processCardPayment(amount: number | string, currency: string, card: Card) {
        if (!card || !card.number) throw new BadRequestException('Card details required');
        if (!PaymentService.luhnCheck(card.number)) {
            return { success: false, reason: 'Invalid card number' };
        }

        // Expiry basic check
        const now = new Date();
        const exp = new Date(card.expYear, card.expMonth - 1, 1);
        if (exp < new Date(now.getFullYear(), now.getMonth(), 1)) {
            return { success: false, reason: 'Card expired' };
        }

        // Deterministic simulation: treat card numbers ending with an odd digit as declined
        const lastDigit = parseInt(card.number.replace(/\D/g, '').slice(-1), 10);
        if (isNaN(lastDigit)) return { success: false, reason: 'Invalid card number' };

        if (lastDigit % 2 === 1) {
            return { success: false, reason: 'Card declined' };
        }

        // Success — return a fake transaction id
        const txId = `tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        return { success: true, transactionId: txId, paidAt: new Date() };
    }
}
