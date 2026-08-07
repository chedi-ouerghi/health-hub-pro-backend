import { SpecialtiesService } from './specialties.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('SpecialtiesService', () => {
  let service: SpecialtiesService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new SpecialtiesService(m.prisma as any);
  });

  it('returns specialties ordered by name', async () => {
    const specialties = [{ id: 's1', name: 'Cardiology' }];
    m.prisma.specialty.findMany.mockResolvedValue(specialties);

    await expect(service.findAll()).resolves.toEqual(specialties);

    expect(m.prisma.specialty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });
});
