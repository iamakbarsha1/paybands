import { minorUnitsFor } from '@paybands/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { LANDMARKS } from '../testing/fixture';
import { run, type AskResult } from './run';
import { translate, type Complete } from './translate';

/** A real person and a real figure, read out of the seed rather than written down here. */
type Subject = {
  readonly firstName: string;
  readonly lastName: string;
  readonly amountMinor: bigint;
  readonly currencyCode: string;
};

/**
 * The below-band employee, because the outliers report names them: the report these tests run
 * carries this name and this figure, so the prompt is being checked for data that is on the
 * path rather than for data nothing here would have produced.
 */
async function readSubject(prisma: PrismaClient): Promise<Subject> {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: LANDMARKS.belowBandEmployeeId },
    select: {
      firstName: true,
      lastName: true,
      salaryRecords: {
        where: { effectiveTo: null },
        select: { amountMinor: true, currencyCode: true },
      },
    },
  });

  const salary = employee.salaryRecords[0];
  if (salary === undefined) throw new Error('the seeded employee has no open salary record');

  return { firstName: employee.firstName, lastName: employee.lastName, ...salary };
}

/** The figure as the column holds it, and as a person says it. */
function spellings({ amountMinor, currencyCode }: Subject): readonly string[] {
  const minor = amountMinor.toString();
  const places = minorUnitsFor(currencyCode);
  return places === 0 ? [minor] : [minor, minor.slice(0, -places)];
}

describe.skipIf(!hasTestDatabase())('the model boundary', () => {
  let prisma: PrismaClient;
  let subject: Subject;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    subject = await readSubject(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * A question all the way through: translated, then run. `prompts` is everything the model
   * was shown, `result` is what the ask bar would render.
   */
  async function ask(question: string): Promise<{ prompts: string[]; result: AskResult }> {
    const prompts: string[] = [];
    const complete: Complete = (prompt) => {
      prompts.push(prompt);
      return Promise.resolve('{"report":"outliers"}');
    };

    const translation = await translate(question, complete);
    if (!translation.accepted) throw new Error(translation.reason);

    return { prompts, result: await run(prisma, translation.query) };
  }

  it('shows the model no name out of the database, for a question that names a person', async () => {
    const { prompts, result } = await ask('is Dana Whitfield paid below her band?');

    // Nobody in the seed is called that, so a seeded name in the prompt could only have been
    // put there by this code.
    for (const prompt of prompts) {
      expect(prompt.toLowerCase()).not.toContain(subject.firstName.toLowerCase());
      expect(prompt.toLowerCase()).not.toContain(subject.lastName.toLowerCase());
    }
    // The answer does carry the name, which is what makes the assertion above worth making.
    expect(JSON.stringify(result)).toContain(subject.lastName);
  });

  it('shows the model no salary figure', async () => {
    const { prompts, result } = await ask('who is paid outside their band?');

    for (const prompt of prompts) {
      // Separators stripped first, so "£70,123.45" is not a way past this.
      const digits = prompt.replace(/\D/gu, '');
      for (const figure of spellings(subject)) {
        expect(digits).not.toContain(figure);
      }
    }
    expect(JSON.stringify(result)).toContain(subject.amountMinor.toString());
  });

  it('asks the model once', async () => {
    const { prompts } = await ask('how is pay spread across departments?');

    // Single-turn translation is the ceiling in `docs/design-notes.md` §7: no conversation
    // memory, no tool loop. The count carries the report too — `run` happens after the only
    // call, so nothing it produced can have reached the model.
    expect(prompts).toHaveLength(1);
  });

  it('sends a name the question itself carries, which is not a leak this claims to stop', async () => {
    const { prompts } = await ask(`is ${subject.firstName} ${subject.lastName} underpaid?`);

    // A question is the user's own words, and they travel as typed. What never travels is a
    // row the system holds. See docs/decisions/decision-log.md, decision 55.
    expect(prompts[0]).toContain(subject.lastName);
  });
});
