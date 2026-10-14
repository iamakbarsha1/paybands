import { CURRENCY_CODES } from '@paybands/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../generated/prisma/client';
import type { App } from './app';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from './testing/db';
import { FIXTURE } from './testing/fixture';

interface Body {
  currencies: string[];
  genders: string[];
  salaryReasons: string[];
  countries: { code: string; name: string }[];
  departments: { id: number; name: string }[];
  jobLevels: { id: number; name: string }[];
}

describe.skipIf(!hasTestDatabase())('GET /reference', () => {
  let prisma: PrismaClient;
  let app: App;
  let body: Body;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = testApp(prisma);
    body = (await app.inject({ method: 'GET', url: '/reference' })).json<Body>();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('serves the closed vocabularies from the code', () => {
    expect(body.currencies).toEqual([...CURRENCY_CODES]);
    expect(body.genders).toEqual(['female', 'male', 'other', 'undisclosed']);
    expect(body.salaryReasons).toEqual(['hire', 'merit', 'promotion', 'market']);
  });

  it('serialises through its schema, dropping nothing the schema declares', () => {
    expect(Object.keys(body).sort()).toEqual([
      'countries',
      'currencies',
      'departments',
      'genders',
      'jobLevels',
      'salaryReasons',
    ]);
  });

  it('serves the rows a filter is built from, from the database', () => {
    expect(body.countries.map((country) => country.code).sort()).toEqual(
      FIXTURE.countries.map((country) => country.code).sort(),
    );
    expect(body.departments).toHaveLength(FIXTURE.departments.length);
    expect(body.jobLevels).toHaveLength(FIXTURE.jobLevels.length);
  });

  it('names every row, because a filter of ids is unusable', () => {
    expect(body.countries.every((country) => country.name !== '')).toBe(true);
    expect(body.departments.every((department) => department.name !== '')).toBe(true);
    expect(body.jobLevels.every((level) => level.name !== '')).toBe(true);
  });

  it('orders levels by rank, not by name', () => {
    expect(body.jobLevels.map((level) => level.id)).toEqual(
      [...FIXTURE.jobLevels].sort((left, right) => left.rank - right.rank).map((level) => level.id),
    );
  });
});
