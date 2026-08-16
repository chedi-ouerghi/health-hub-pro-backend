import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { createPrismaMock, PrismaMock } from "../../test/prisma-mock";
import { ActivityType } from "@prisma/client";

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

  describe("getPatientActivityLogs", () => {
    it("throws NotFoundException for unknown patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.getPatientActivityLogs("pat-x")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns paginated activity logs", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.activityLog.findMany.mockResolvedValue([{ id: "log-1" }]);
      m.prisma.activityLog.count.mockResolvedValue(1);

      const result = await service.getPatientActivityLogs("pat-1", 1, 10);

      expect(result.logs).toEqual([{ id: "log-1" }]);
      expect(result.meta.total).toBe(1);
      expect(m.prisma.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: "pat-1" }, take: 10 }),
      );
    });
  });

  describe("createPatientActivityLog", () => {
    const dto = { type: ActivityType.PRESCRIPTION, title: "Ordonnance", meta: "Amox 500" };

    it("throws NotFoundException for unknown patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.createPatientActivityLog("user-1", "DOCTOR", "pat-x", dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("forbids doctors without an appointment with the patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.doctor.findUnique.mockResolvedValue({ id: "doc-1" });
      m.prisma.appointment.findFirst.mockResolvedValue(null);

      await expect(
        service.createPatientActivityLog("user-doc", "DOCTOR", "pat-1", dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("allows the treating doctor to create a log", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.doctor.findUnique.mockResolvedValue({ id: "doc-1" });
      m.prisma.appointment.findFirst.mockResolvedValue({ id: "appt-1" });
      m.tx.activityLog.create.mockResolvedValue({ id: "log-1" });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.createPatientActivityLog("user-doc", "DOCTOR", "pat-1", dto);

      expect(result.id).toBe("log-1");
      expect(m.tx.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ patientId: "pat-1", type: ActivityType.PRESCRIPTION }),
        }),
      );
    });

    it("allows admin (system) to create a log without appointment", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.tx.activityLog.create.mockResolvedValue({ id: "log-2" });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.createPatientActivityLog("admin-1", "ADMIN", "pat-1", dto);

      expect(result.id).toBe("log-2");
      expect(m.prisma.appointment.findFirst).not.toHaveBeenCalled();
    });
  });
});
