import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cache_ttl';
export const CacheTTL = (seconds: number) => SetMetadata(CACHE_TTL_KEY, seconds);
