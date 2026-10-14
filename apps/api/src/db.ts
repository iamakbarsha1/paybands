import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The only place outside the repositories that holds the Prisma client. Handlers take a
 * repository function and never see this (decision 47), which the ESLint rule in
 * `eslint.config.js` enforces rather than trusts.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  if (connectionString === undefined) {
    if (existsSync('.env')) process.loadEnvFile('.env');
  }

  const url = connectionString ?? process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.');
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
