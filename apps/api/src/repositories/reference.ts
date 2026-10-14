import type { PrismaClient } from '../../generated/prisma/client';

export interface ReferenceLists {
  readonly countries: { readonly code: string; readonly name: string }[];
  readonly departments: { readonly id: number; readonly name: string }[];
  readonly jobLevels: { readonly id: number; readonly name: string }[];
}

/**
 * The lists a filter is built from. They come from the database rather than a constant
 * because they are rows someone can add to, unlike the currencies and genders in
 * `@paybands/core`, which are a closed vocabulary the code branches on.
 */
export async function referenceLists(prisma: PrismaClient): Promise<ReferenceLists> {
  const [countries, departments, jobLevels] = await Promise.all([
    prisma.country.findMany({ orderBy: { name: 'asc' } }),
    prisma.department.findMany({ orderBy: { name: 'asc' } }),
    prisma.jobLevel.findMany({ orderBy: { rank: 'asc' } }),
  ]);

  return {
    countries: countries.map((row) => ({ code: row.code, name: row.name })),
    departments: departments.map((row) => ({ id: row.id, name: row.name })),
    jobLevels: jobLevels.map((row) => ({ id: row.id, name: row.name })),
  };
}
