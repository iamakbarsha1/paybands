import type { Role } from '@paybands/core';
import type { PrismaClient } from '../../generated/prisma/client';

export interface AppUserRow {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly role: Role;
}

/** The hash comes back because the login path needs it; nothing else reads this function. */
export function findUserByEmail(prisma: PrismaClient, email: string): Promise<AppUserRow | null> {
  return prisma.appUser.findUnique({ where: { email } });
}

export function findUserById(prisma: PrismaClient, id: number): Promise<AppUserRow | null> {
  return prisma.appUser.findUnique({ where: { id } });
}
