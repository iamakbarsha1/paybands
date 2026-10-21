import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom keeps one document for the whole file, so a component left mounted by one test is
 * still in the tree the next one queries — and `getByRole` then fails on two matches for a
 * reason that has nothing to do with the test that failed.
 */
afterEach(cleanup);
