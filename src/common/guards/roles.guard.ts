import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      this.logger.warn(`RolesGuard: no user on request - handler=${context.getHandler().name}`);
      return false;
    }
    if (user.role === 'SUPER_ADMIN') return true;

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      this.logger.warn(`RolesGuard: DENIED - requiredRoles=${JSON.stringify(requiredRoles)} user.role=${user.role}`);
    }
    return hasRole;
  }
}
