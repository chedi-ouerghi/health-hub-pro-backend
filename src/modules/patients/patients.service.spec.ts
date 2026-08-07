import { NotFoundException } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { createPrismaMock, PrismaMock } from "../../test/prisma-mock";

describe("PatientsService", () => {
  let service: PatientsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new PatientsService(m.prisma as any);
  });

  describe("getMyProfile", () => {
    it("returns the patient profile", async () => {
      const patient = {
        id: "pat-1",
        firstName: "John",
        lastName: "Doe",
        user: { email: "a@b.io" },
      };
      m.prisma.patient.findUnique.mockResolvedValue(patient);

      await expect(service.getMyProfile("user-1")).resolves.toEqual(patient);
    });

    it("throws NotFoundException when profile is missing", async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile("user-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("updateMyProfile", () => {
    it("throws NotFoundException when patient is missing", async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMyProfile("user-1", { firstName: "A" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("updates and returns the patient profile", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      const updated = {
        id: "pat-1",
        firstName: "A",
        lastName: "B",
        updatedAt: new Date(),
      };
      m.prisma.patient.update.mockResolvedValue(updated);

      const result = await service.updateMyProfile("user-1", {
        firstName: "A",
        lastName: "B",
      });

      expect(result).toEqual(updated);
      expect(m.prisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } }),
      );
    });
  });

  describe("getPatientById", () => {
    // Access control (role + doctor↔patient link) is enforced by
    // DoctorPatientAccessGuard — the service only fetches the profile.
    it("returns the patient profile", async () => {
      const patient = {
        id: "pat-9",
        firstName: "A",
        lastName: "B",
        user: { email: "x@y.io" },
      };
      m.prisma.patient.findUnique.mockResolvedValue(patient);

      await expect(service.getPatientById("DOCTOR", "pat-9")).resolves.toEqual(
        patient,
      );
    });

    it("throws NotFoundException for unknown patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.getPatientById("DOCTOR", "pat-9"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
