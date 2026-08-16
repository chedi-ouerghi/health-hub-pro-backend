import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hhp-upload-test-'));
    const config = { get: jest.fn(() => tempDir) } as unknown as ConfigService;
    service = new UploadService(config);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const makeFile = (overrides: Partial<any> = {}) => ({
    originalname: 'Photo de profil.jpg',
    mimetype: 'image/jpeg',
    size: 128,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    ...overrides,
  });

  it('throws BadRequestException when no file is provided', async () => {
    await expect(service.storeFile(undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.storeFile({})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported mime types', async () => {
    await expect(service.storeFile(makeFile({ mimetype: 'text/html', buffer: Buffer.from('<html>') }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects MIME-declared types that do not match the actual content', async () => {
    await expect(
      service.storeFile(makeFile({ mimetype: 'image/jpeg', buffer: Buffer.from('%PDF-1.4 fake') })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects legacy document types (doc/docx/gif)', async () => {
    await expect(
      service.storeFile(makeFile({ mimetype: 'application/msword', buffer: Buffer.from('fake-doc') })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.storeFile(makeFile({ mimetype: 'image/gif', buffer: Buffer.from('GIF89a') })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects images above the 5 MB limit', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff; // JPEG magic
    await expect(service.storeFile(makeFile({ buffer: big }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts PDFs up to 10 MB', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(8 * 1024 * 1024, 0x20)]);
    const result = await service.storeFile(makeFile({ mimetype: 'application/pdf', originalname: 'rapport.pdf', buffer: pdf }));
    expect(result.url).toMatch(/rapport\.pdf$/);
  });

  it('stores the file on disk and returns a public URL', async () => {
    const result = await service.storeFile(makeFile());

    expect(result.url).toMatch(/^\/uploads\/\d{4}-\d{2}-\d{2}\/.*photo-de-profil\.jpg$/);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.size).toBe(6);

    const filePath = join(tempDir, result.url.replace('/uploads/', '').replace(/\//g, '\\'));
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
  });

  it('sanitizes the original filename', async () => {
    const result = await service.storeFile(makeFile({ originalname: 'Rapport médical!!! 2026.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }));

    expect(result.url).toMatch(/rapport-medical-2026\.pdf$/);
  });

  it('falls back to a default name when the sanitized name is empty', async () => {
    const result = await service.storeFile(makeFile({ originalname: '!!!' }));

    expect(result.url).toMatch(/\/(file|.*)\.jpg$/);
    expect(result.url).not.toContain('!');
  });
});
