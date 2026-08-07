import { ForbiddenException } from "@nestjs/common";
import { DoctorPatientAccessGuard } from "./doctor-patient-access.guard";
import { createPrismaMock, PrismaMock } from "../../test/prisma-mock";

function makeContext(
  user: any,
  method = "GET",
  params: Record<string, string> = { id: "pat-1" },
) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, method, params }) }),
  } as any;
}

describe("DoctorPatientAccessGuard", () => {
  let guard: DoctorPatientAccessGuard;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    guard = new DoctorPatientAccessGuard(m.prisma as any);
  });

  it("denies when no user is attached", async () => {
    await expect(guard.canActivate(makeContext(null))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("denies PATIENT role", async () => {
    await expect(
      guard.canActivate(makeContext({ id: "u-1", role: "PATIENT" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe("DOCTOR", () => {
    it("denies a doctor without a profile", async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(makeContext({ id: "doc-user", role: "DOCTOR" })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("denies a doctor without an appointment with the patient", async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: "doc-1" });
      m.prisma.appointment.findFirst.mockResolvedValue(null);

      await expect(
        guard.canActivate(makeContext({ id: "doc-user", role: "DOCTOR" })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("allows a doctor with a linked appointment", async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: "doc-1" });
      m.prisma.appointment.findFirst.mockResolvedValue({ id: "appt-1" });

      await expect(
        guard.canActivate(makeContext({ id: "doc-user", role: "DOCTOR" })),
      ).resolves.toBe(true);
      expect(m.prisma.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { doctorId: "doc-1", patientId: "pat-1" },
        }),
      );
    });
  });

  describe("ADMIN / SUPER_ADMIN", () => {
    it("allows GET on any patient", async () => {
      await expect(
        guard.canActivate(makeContext({ id: "admin-1", role: "ADMIN" })),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(makeContext({ id: "root-1", role: "SUPER_ADMIN" })),
      ).resolves.toBe(true);
    });

    it("denies POST (read-only, cannot prescribe/record)", async () => {
      await expect(
        guard.canActivate(
          makeContext({ id: "admin-1", role: "ADMIN" }, "POST"),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        guard.canActivate(
          makeContext({ id: "root-1", role: "SUPER_ADMIN" }, "POST"),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
