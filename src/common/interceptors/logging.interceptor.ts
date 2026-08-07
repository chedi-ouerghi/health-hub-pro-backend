import * as crypto from 'crypto';
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    const correlationId = req.headers['x-correlation-id'] ?? crypto.randomUUID();

    req.correlationId = correlationId;
    req.res?.setHeader('x-correlation-id', correlationId);

    return next.handle().pipe(
      tap(() => {
        const res = ctx.switchToHttp().getResponse();
        const ms = Date.now() - start;
        this.logger.log(`[${correlationId}] ${req.method} ${req.url} - ${res.statusCode} - ${ms}ms`);
      }),
    );
  }
}
