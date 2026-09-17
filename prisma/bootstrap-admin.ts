import "dotenv/config";
import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to bootstrap the admin account`);
  }
  return value;
}

async function main() {
  const email = requiredEnvironment("ADMIN_EMAIL").toLowerCase();
  const password = requiredEnvironment("ADMIN_PASSWORD");
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "Platform";
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || "Admin";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      deletedAt: null,
    },
    create: {
      email,
      password: passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.admin.upsert({
    where: { userId: user.id },
    update: { firstName, lastName },
    create: { userId: user.id, firstName, lastName },
  });

  console.log(`Admin account ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
