import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

/**
 * Validates that a route parameter is a valid CUID (Prisma default) or UUID.
 * Accepts:
 *   - CUID v1: starts with 'c', 25 chars, alphanumeric
 *   - CUID v2: starts with a-z, 24 chars
 *   - UUID v1-v5
 */
@Injectable()
export class ParseCuidPipe implements PipeTransform<string> {
  transform(value: string): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // CUID v1: c + 24 alphanumeric chars (total 25)
    const cuidV1Regex = /^c[a-z0-9]{24}$/i;
    // CUID v2: 24 lowercase alphanumeric chars
    const cuidV2Regex = /^[a-z0-9]{24}$/;

    if (!uuidRegex.test(value) && !cuidV1Regex.test(value) && !cuidV2Regex.test(value)) {
      throw new BadRequestException(`Invalid ID format: ${value}`);
    }
    return value;
  }
}

/** Backward-compatible alias */
export { ParseCuidPipe as ParseUUIDPipe };
