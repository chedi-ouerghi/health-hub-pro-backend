import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService, RawUploadFile } from './upload.service';

/**
 * Shape of the file injected by MulterFileInterceptor (memory storage).
 * Typed locally so the build does not depend on global Express.Multer types.
 */
interface MulterMemoryFile extends RawUploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // global cap — per-type checks in the service (5 MB images / 10 MB PDF)
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image (jpeg, png, webp — max 5 MB) or PDF (max 10 MB)',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload an image (jpeg/png/webp ≤ 5 MB) or a PDF (≤ 10 MB); returns its public URL' })
  upload(@UploadedFile() file: MulterMemoryFile) {
    return this.uploadService.storeFile(file);
  }
}