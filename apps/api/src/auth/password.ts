import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * OWASP's argon2id profile: 19 MiB of memory, two passes, one lane. The parameters are
 * written down here and encoded in every hash, so a change of cost is visible in the table
 * rather than guessed at. Raising them later costs a rehash on next login, not a migration.
 *
 * The algorithm is argon2id by the library's default and cannot be named here: its
 * `Algorithm` is an ambient `const enum`, which `verbatimModuleSyntax` refuses to import.
 * `password.test.ts` asserts the `$argon2id$` prefix instead, so a changed default is a
 * failing test rather than a silent downgrade to argon2i.
 */
export const ARGON2ID: Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * No salt argument, deliberately. Argon2 generates one per call and writes it into the
 * encoded hash, which is what stops two people with the same password from sharing a row
 * value. The seed pins a salt of its own so the demo login survives a reseed (PB-023);
 * that is the seed's business and never reaches this path.
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2ID);
}

/** A stored value this cannot parse is a failed login, not a 500: the row is already wrong. */
export async function verifyPassword(encoded: string, plain: string): Promise<boolean> {
  try {
    return await verify(encoded, plain, ARGON2ID);
  } catch {
    return false;
  }
}
