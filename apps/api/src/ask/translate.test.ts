import { describe, expect, it } from 'vitest';
import { SLICE_GROUPS } from '../repositories/analytics';
import { translate, type Complete, type Translation } from './translate';

/** A model that answers with the same thing whatever it is shown. */
const answering =
  (raw: string | null): Complete =>
  () =>
    Promise.resolve(raw);

/** The reason off a refusal. An accepted query here is the failure, and says what it accepted. */
function rejection(result: Translation): string {
  if (result.accepted) throw new Error(`accepted ${JSON.stringify(result.query)}`);

  return result.reason;
}

/** The opening of every schema refusal, so the three rejection paths stay told apart. */
const NOT_A_QUERY = 'The answer is not a query these reports take.';

describe('translate', () => {
  it('reads a question about the bands', async () => {
    const result = await translate('show me the pay bands', answering('{"report":"bands"}'));

    expect(result).toEqual({ accepted: true, query: { report: 'bands' } });
  });

  it('carries the optional band parameters when the question names them', async () => {
    const result = await translate(
      'what does level 3 pay in India',
      answering('{"report":"bands","country":"IN","level":3}'),
    );

    expect(result).toEqual({
      accepted: true,
      query: { report: 'bands', country: 'IN', level: 3 },
    });
  });

  it('reads a question about the salary distribution', async () => {
    const result = await translate(
      'how is pay spread across departments',
      answering('{"report":"distribution","groupBy":"department"}'),
    );

    expect(result).toEqual({
      accepted: true,
      query: { report: 'distribution', groupBy: 'department' },
    });
  });

  it('reads a question about comp ratio', async () => {
    const result = await translate(
      'where does each country sit against its bands',
      answering('{"report":"comp-ratio","groupBy":"country"}'),
    );

    expect(result).toEqual({
      accepted: true,
      query: { report: 'comp-ratio', groupBy: 'country' },
    });
  });

  it('reads a question about the gender pay gap', async () => {
    const result = await translate(
      'is there a pay gap by level',
      answering('{"report":"pay-gap","groupBy":"level"}'),
    );

    expect(result).toEqual({
      accepted: true,
      query: { report: 'pay-gap', groupBy: 'level' },
    });
  });

  it('reads a question about outliers', async () => {
    const result = await translate(
      'who is paid outside their band',
      answering('{"report":"outliers"}'),
    );

    expect(result).toEqual({ accepted: true, query: { report: 'outliers' } });
  });

  it('rejects an answer that is not JSON', async () => {
    const result = await translate(
      'show me the pay bands',
      answering('Sure! Here are the pay bands for every country.'),
    );

    expect(rejection(result)).toBe('The model did not answer with JSON.');
  });

  it('rejects a report nobody serves', async () => {
    const result = await translate('how many people leave', answering('{"report":"attrition"}'));

    expect(rejection(result)).toContain(NOT_A_QUERY);
    expect(rejection(result)).toContain('report');
  });

  it('rejects a grouping the reports do not offer', async () => {
    const result = await translate(
      'pay by team',
      answering('{"report":"distribution","groupBy":"team"}'),
    );

    expect(rejection(result)).toContain(NOT_A_QUERY);
    expect(rejection(result)).toContain('groupBy');
  });

  it('rejects a parameter the report does not take, rather than dropping it', async () => {
    const result = await translate(
      'outliers in sales',
      answering('{"report":"outliers","groupBy":"department"}'),
    );

    expect(rejection(result)).toContain(NOT_A_QUERY);
    expect(rejection(result)).toContain('groupBy');
  });

  it('rejects a level that is not a positive whole number', async () => {
    const result = await translate(
      'bands at level zero',
      answering('{"report":"bands","level":0}'),
    );

    expect(rejection(result)).toContain(NOT_A_QUERY);
    expect(rejection(result)).toContain('level');
  });

  it('rejects an answer with no content', async () => {
    const result = await translate('show me the pay bands', answering(null));

    expect(rejection(result)).toBe('The model returned no answer to read.');
  });

  it('rejects an answer that is only whitespace', async () => {
    const result = await translate('show me the pay bands', answering('   \n '));

    expect(rejection(result)).toBe('The model returned no answer to read.');
  });

  it('shows the model every report and every grouping it can ask for', async () => {
    let shown = '';
    await translate('anything at all', (prompt) => {
      shown = prompt;
      return Promise.resolve(null);
    });

    // Pinned literals, because these are the URL path segments the screens already use.
    for (const report of ['bands', 'distribution', 'comp-ratio', 'pay-gap', 'outliers']) {
      expect(shown).toContain(report);
    }
    // Read off the endpoints' own list: a grouping added there and missing here is the bug.
    for (const group of SLICE_GROUPS) {
      expect(shown).toContain(group);
    }
  });
});
