import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';

/**
 * Autorise le changement de statut d'une réservation si :
 *   user.role === 'SUPER_ADMIN'  OU  user.role === 'ADMIN'
 *   OU  user.role === 'DOCTOR'  (l'appartenance réelle du RDV est vérifiée
 *       dans le service via `updateStatus` → `You can only update status of
 *       your own appointments`)
 *   OU  Permission.APPROVE_RESERVATIONS ∈ user.permissions
 *
 * CORRECTION #5 : le ADMIN doit pouvoir approuver/refuser/confirmer sans
 * disposer forcément de la permission granulaire APPROVE_RESERVATIONS
 * (qui reste utile pour autoriser un autre rôle sur ces actions).
 *
 * CORRECTION accès (audit) : un DOCTOR doit pouvoir traiter les RDV de son
 * agenda (UPCOMING → COMPLETED / NO_SHOW / CANCELLED / RESCHEDULED).
 * L'ownership est contrôlé côté service, pas ici.
 */
@Injectable()
export class ApproveReservationsGuard implements CanActivate {
  private readonly logger = new Logger(ApproveReservationsGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      this.logger.warn('ApproveReservationsGuard: no user on request');
      return false;
    }
    if (
      user.role === 'SUPER_ADMIN' ||
      user.role === 'ADMIN' ||
      user.role === 'DOCTOR'
    ) {
      return true;
    }
    const allowed = user.permissions?.includes('APPROVE_RESERVATIONS') === true;
    if (!allowed) {
      this.logger.warn(`ApproveReservationsGuard: DENIED role=${user.role}`);
    }
    return allowed;
  }
}