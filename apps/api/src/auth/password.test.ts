import { hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import { ARGON2ID, hashPassword, verifyPassword } from './password';

const PASSWORD = 'paybands-demo-2026';

describe('password hashing', () => {
  it('stores an argon2id hash and never the password', async () => {
    const encoded = await hashPassword(PASSWORD);

    expect(encoded.startsWith('$argon2id$')).toBe(true);
    expect(encoded).not.toContain(PASSWORD);
  });

  it('hashes at the documented cost, and says so in the hash', async () => {
    // Pinned to the literals rather than read back off ARGON2ID: a test that quotes the
    // constant moves with it, and the whole point is that a changed cost is deliberate.
    expect(ARGON2ID).toMatchObject({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    const encoded = await hashPassword(PASSWORD);
    expect(encoded).toContain('m=19456,t=2,p=1');
  });

  it('salts every hash, so two people with the same password do not match in the table', async () => {
    const [one, two] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    expect(one).not.toBe(two);
  });

  it('accepts the right password and refuses the wrong one', async () => {
    const encoded = await hashPassword(PASSWORD);

    expect(await verifyPassword(encoded, PASSWORD)).toBe(true);
    expect(await verifyPassword(encoded, 'paybands-demo-2025')).toBe(false);
    expect(await verifyPassword(encoded, '')).toBe(false);
  });

  it('refuses a stored value it cannot read rather than throwing', async () => {
    expect(await verifyPassword('not-a-hash', PASSWORD)).toBe(false);
    expect(await verifyPassword('', PASSWORD)).toBe(false);
  });

  it('verifies a hash salted by the seed, because the salt travels in the hash', async () => {
    // The seed pins a salt so the demo login survives a reseed (PB-023). The login path
    // must not know that: argon2 reads the salt back out of the encoded hash.
    const encoded = await hash(PASSWORD, { ...ARGON2ID, salt: Buffer.from('paybands-seed-01') });

    expect(await verifyPassword(encoded, PASSWORD)).toBe(true);
  });
});
