import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message ?? exception.message;
      code = exception.name;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Resource already exists';
          code = 'UNIQUE_CONSTRAINT';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Resource not found';
          code = 'NOT_FOUND';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid reference to parent resource';
          code = 'FK_CONSTRAINT';
          break;
        case 'P2014':
          status = HttpStatus.BAD_REQUEST;
          message = 'Required relation violation';
          code = 'RELATION_VIOLATION';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Database error';
          code = `PRISMA_${exception.code}`;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data format';
      code = 'VALIDATION_ERROR';
    }

    this.logger.error(`${request.method} ${request.url} — ${status} ${code}: ${message}`);

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      code,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
