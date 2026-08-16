import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { join, isAbsolute } from 'path';
import { mkdir, writeFile } from 'fs/promises';

/**
 * Storage policy (2026):
 * - Allowed types: images (jpeg, png, webp) and PDF only.
 * - Size limits: 5 MB for images, 10 MB for PDFs.
 * - The declared MIME type is cross-checked against the file's magic bytes
 *   before anything is written to disk.
 * - Storage is local (uploads/{date}/…) and served statically under /uploads.
 *   Ready for a cloud bucket (S3/Cloudinary) behind a storage abstraction.
 */
const TYPE_RULES: Record<string, { ext: string; maxBytes: number; category: 'image' | 'pdf'; sniff: (b: Buffer) => boolean }> = {
  'image/jpeg': {
    ext: 'jpg',
    maxBytes: 5 * 1024 * 1024,
    category: 'image',
    sniff: (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    ext: 'png',
    maxBytes: 5 * 1024 * 1024,
    category: 'image',
    sniff: (b: Buffer) =>
      b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    ext: 'webp',
    maxBytes: 5 * 1024 * 1024,
    category: 'image',
    sniff: (b: Buffer) =>
      b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'application/pdf': {
    ext: 'pdf',
    maxBytes: 10 * 1024 * 1024,
    category: 'pdf',
    sniff: (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
};

export interface StoredFile {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface RawUploadFile {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir: string;

  constructor(private readonly config: ConfigService) {
    const configured = this.config.get<string>('UPLOAD_DIR') ?? 'uploads';
    this.uploadDir = isAbsolute(configured) ? configured : join(process.cwd(), configured);
  }

  /**
   * Validate + persist an uploaded file and return its public URL.
   * Rejects: empty payload, unsupported types, declared MIME ≠ magic bytes,
   * and files exceeding the per-type size limit.
   */
  async storeFile(file: RawUploadFile | undefined): Promise<StoredFile> {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file received');
    }

    const rule = TYPE_RULES[file.mimetype ?? ''];
    if (!rule) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype ?? 'unknown'} (images jpeg/png/webp and PDF only)`);
    }

    // Verify the REAL content type (magic bytes) — never trust the declared MIME alone
    if (!rule.sniff(file.buffer)) {
      throw new BadRequestException(`File content does not match declared type ${file.mimetype}`);
    }

    if (file.buffer.length > rule.maxBytes) {
      throw new BadRequestException(
        `File too large: max ${Math.round(rule.maxBytes / 1024 / 1024)} MB for ${rule.category === 'image' ? 'images' : 'PDFs'}`,
      );
    }

    const safeBase =
      (file.originalname ?? 'file')
        .replace(/\.[^.]+$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .toLowerCase()
        .slice(0, 60) || 'file';

    const filename = `${Date.now()}-${randomBytes(6).toString('hex')}-${safeBase}.${rule.ext}`;
    const datePath = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
    const dir = join(this.uploadDir, datePath);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), file.buffer);

    const url = `/uploads/${datePath}/${filename}`;
    this.logger.log(`Stored ${url} (${file.buffer.length} bytes)`);
    return { url, filename, mimeType: file.mimetype ?? '', size: file.buffer.length };
  }
}