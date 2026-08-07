import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RedisService } from '../../redis/redis.service';
import { CACHE_TTL_KEY } from '../decorators/cache-ttl.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (request.method !== 'GET') return next.handle();

    const ttl = this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!ttl || ttl <= 0) return next.handle();

    const key = `cache:${request.url}`;

    return new Observable((observer) => {
      this.redis.get(key).then((cached) => {
        if (cached) {
          try {
            observer.next(JSON.parse(cached));
            observer.complete();
            return;
          } catch {}
        }
        next.handle().subscribe({
          next: (value) => {
            if (value !== undefined) this.redis.set(key, JSON.stringify(value), ttl);
            observer.next(value);
          },
          error: (e) => observer.error(e),
          complete: () => observer.complete(),
        });
      });
    });
  }
}
