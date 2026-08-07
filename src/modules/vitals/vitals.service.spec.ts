import { ForbiddenException } from '@nestjs/common';
import { VitalsService } from './vitals.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('VitalsService', () => {
  let service: VitalsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new VitalsService(m.prisma as any);
  });

  describe('create', () => {
    it('throws ForbiddenException for non-patient users', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { heartRate: 70, systolic: 120, diastolic: 80 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates a vital record for the patient', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      const record = { id: 'vr-1', heartRate: 70 };
      m.prisma.vitalRecord.create.mockResolvedValue(record);

      const result = await service.create('user-1', {
        heartRate: 70,
        systolic: 120,
        diastolic: 80,
        sleepHours: 7.5,
        steps: 8000,
      });

      expect(result).toEqual(record);
      expect(m.prisma.vitalRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ patientId: 'pat-1', steps: 8000 }) }),
      );
    });
  });

  describe('findMine', () => {
    it('throws ForbiddenException for non-patient users', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.findMine('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the most recent vital records', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      m.prisma.vitalRecord.findMany.mockResolvedValue([{ id: 'vr-1' }]);

      const result = await service.findMine('user-1', 10);

      expect(result).toHaveLength(1);
      expect(m.prisma.vitalRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: 'pat-1' }, take: 10, orderBy: { recordedAt: 'desc' } }),
      );
    });
  });

  describe('findForPatient', () => {
    it('returns the patient vital records with the recording doctor', async () => {
      m.prisma.vitalRecord.findMany.mockResolvedValue([
        { id: 'vr-1', recordedByDoctor: { id: 'doc-1' } },
      ]);

      const result = await service.findForPatient('pat-9', 25);

      expect(result).toHaveLength(1);
      expect(m.prisma.vitalRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: 'pat-9' }, take: 25, orderBy: { recordedAt: 'desc' } }),
      );
    });
  });

  describe('createForPatient', () => {
    it('throws ForbiddenException when the user has no doctor profile', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.createForPatient('doc-user', 'pat-9', { heartRate: 72 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('records a vital measurement and logs the activity', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1', firstName: 'Jane', lastName: 'Smith' });
      const record = { id: 'vr-2', heartRate: 72, patientId: 'pat-9' };
      m.tx.vitalRecord.create.mockResolvedValue(record);
      m.tx.activityLog.create.mockResolvedValue({});

      const result = await service.createForPatient('doc-user', 'pat-9', {
        heartRate: 72,
        systolic: 120,
        diastolic: 80,
      });

      expect(result).toEqual(record);
      expect(m.tx.vitalRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'pat-9',
            recordedByDoctorId: 'doc-1',
            heartRate: 72,
          }),
        }),
      );
      expect(m.tx.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ patientId: 'pat-9', type: 'FILE' }),
        }),
      );
    });
  });
});
