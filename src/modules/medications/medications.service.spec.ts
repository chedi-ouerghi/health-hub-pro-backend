import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { MedicationsService } from "./medications.service";
import { createPrismaMock, PrismaMock } from "../../test/prisma-mock";

describe("MedicationsService", () => {
  let service: MedicationsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new MedicationsService(m.prisma as any);
  });

  describe("create", () => {
    it("throws ForbiddenException for non-patient users", async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.create("user-1", {
          name: "Aspirin",
          dose: "500mg",
          scheduledTime: "09:00",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("creates a medication for the patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      const med = { id: "med-1", name: "Aspirin" };
      m.prisma.medication.create.mockResolvedValue(med);

      const result = await service.create("user-1", {
        name: "Aspirin",
        dose: "500mg",
        scheduledTime: "09:00",
      });

      expect(result).toEqual(med);
      expect(m.prisma.medication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ patientId: "pat-1" }),
        }),
      );
    });
  });

  describe("findMine", () => {
    it("throws ForbiddenException for non-patient users", async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.findMine("user-1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("returns medications with recent logs", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.medication.findMany.mockResolvedValue([
        { id: "med-1", logs: [] },
      ]);

      const result = await service.findMine("user-1");

      expect(result).toHaveLength(1);
      expect(m.prisma.medication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: "pat-1" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });
  });

  describe("update", () => {
    it("throws NotFoundException when medication does not belong to patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.medication.findUnique.mockResolvedValue(null);

      await expect(
        service.update("user-1", "PATIENT", "med-1", { dose: "250mg" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("updates own medication", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
      });
      m.prisma.medication.update.mockResolvedValue({
        id: "med-1",
        dose: "250mg",
      });

      const result = await service.update("user-1", "PATIENT", "med-1", {
        dose: "250mg",
      });

      expect(result.dose).toBe("250mg");
    });

    it("allows the prescribing doctor to update their prescription", async () => {
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
        prescribedByDoctorId: "doc-1",
      });
      m.prisma.doctor.findUnique.mockResolvedValue({ id: "doc-1" });
      m.prisma.medication.update.mockResolvedValue({
        id: "med-1",
        isActive: false,
      });

      const result = await service.update("doc-user", "DOCTOR", "med-1", {
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });

    it("forbids a doctor who did not prescribe the medication", async () => {
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
        prescribedByDoctorId: "doc-9",
      });
      m.prisma.doctor.findUnique.mockResolvedValue({ id: "doc-1" });

      await expect(
        service.update("doc-user", "DOCTOR", "med-1", { dose: "250mg" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("allows an admin to update any medication", async () => {
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
        prescribedByDoctorId: null,
      });
      m.prisma.medication.update.mockResolvedValue({
        id: "med-1",
        isActive: true,
      });

      const result = await service.update("admin-1", "ADMIN", "med-1", {
        isActive: true,
      });

      expect(result.isActive).toBe(true);
    });
  });

  describe("delete", () => {
    it("throws NotFoundException when medication does not belong to patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-9",
      });

      await expect(
        service.delete("user-1", "PATIENT", "med-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("deletes own medication", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
      });
      m.prisma.medication.delete.mockResolvedValue({ id: "med-1" });

      const result = await service.delete("user-1", "PATIENT", "med-1");

      expect(result.message).toContain("deleted");
    });

    it("allows the prescribing doctor to delete their prescription", async () => {
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
        prescribedByDoctorId: "doc-1",
      });
      m.prisma.doctor.findUnique.mockResolvedValue({ id: "doc-1" });
      m.prisma.medication.delete.mockResolvedValue({ id: "med-1" });

      const result = await service.delete("doc-user", "DOCTOR", "med-1");

      expect(result.message).toContain("deleted");
    });

    it("allows an admin to delete any medication", async () => {
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
        prescribedByDoctorId: null,
      });
      m.prisma.medication.delete.mockResolvedValue({ id: "med-1" });

      const result = await service.delete("admin-1", "ADMIN", "med-1");

      expect(result.message).toContain("deleted");
    });
  });

  describe("createLog", () => {
    it("throws NotFoundException when medication does not belong to patient", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.medication.findUnique.mockResolvedValue(null);

      await expect(
        service.createLog("user-1", "med-1", { status: "TAKEN" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("logs medication intake", async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: "pat-1" });
      m.prisma.medication.findUnique.mockResolvedValue({
        id: "med-1",
        patientId: "pat-1",
      });
      m.prisma.medicationLog.create.mockResolvedValue({
        id: "log-1",
        status: "TAKEN",
      });

      const result = await service.createLog("user-1", "med-1", {
        status: "TAKEN",
      });

      expect(result.id).toBe("log-1");
      expect(m.prisma.medicationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            medicationId: "med-1",
            status: "TAKEN",
          }),
        }),
      );
    });
  });

  describe("findForPatient", () => {
    it("returns the patient medications with the prescribing doctor", async () => {
      m.prisma.medication.findMany.mockResolvedValue([
        { id: "med-1", prescribedByDoctor: { id: "doc-1" } },
      ]);

      const result = await service.findForPatient("pat-9");

      expect(result).toHaveLength(1);
      expect(m.prisma.medication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: "pat-9" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });
  });

  describe("createForPatient", () => {
    it("throws ForbiddenException when the user has no doctor profile", async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.createForPatient("doc-user", "pat-9", {
          name: "Doliprane",
          dose: "1000mg",
          scheduledTime: "08:00",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("prescribes a medication and logs the PRESCRIPTION activity", async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({
        id: "doc-1",
        firstName: "John",
        lastName: "Doe",
      });
      const med = { id: "med-2", name: "Doliprane", patientId: "pat-9" };
      m.tx.medication.create.mockResolvedValue(med);
      m.tx.activityLog.create.mockResolvedValue({});

      const result = await service.createForPatient("doc-user", "pat-9", {
        name: "Doliprane",
        dose: "1000mg",
        scheduledTime: "08:00",
      });

      expect(result).toEqual(med);
      expect(m.tx.medication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: "pat-9",
            prescribedByDoctorId: "doc-1",
            name: "Doliprane",
          }),
        }),
      );
      expect(m.tx.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: "pat-9",
            type: "PRESCRIPTION",
            title: "Nouveau médicament prescrit : Doliprane",
            meta: "1000mg · Dr. John Doe",
          }),
        }),
      );
    });
  });
});
