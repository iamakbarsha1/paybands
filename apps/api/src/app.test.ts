import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

let app: FastifyInstance;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('answers 200 without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /reference', () => {
  it('serves the domain vocabularies from @paybands/core', async () => {
    const response = await app.inject({ method: 'GET', url: '/reference' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      currencies: ['USD', 'GBP', 'EUR', 'INR', 'SGD', 'JPY'],
      genders: ['female', 'male', 'other', 'undisclosed'],
      salaryReasons: ['hire', 'merit', 'promotion', 'market'],
    });
  });
});

describe('an unknown route', () => {
  it('answers 404 rather than falling through to a handler', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
  });
});
