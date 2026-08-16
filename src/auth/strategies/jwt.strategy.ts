import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_TOKEN_COOKIE } from '../../common/utils/cookies.utils';

export interface JwtPayload {
  sub: string;     // userId
  email: string;
  role: string;
  sessionId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: (req) => {
        const bearer = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        if (bearer) return bearer;
        return req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
      },
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user) throw new UnauthorizedException('User not found or deleted');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('Account suspended');
    if (user.status === 'DEACTIVATED') throw new UnauthorizedException('Account deactivated');

    // Attach minimal user info to request.user
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      sessionId: payload.sessionId,
    };
  }
}
