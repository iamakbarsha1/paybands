/**
 * The shape a read comes back in, declared once for the same reason a write is
 * (`contracts.ts`, decision 52): two layers depend on it. The API serialises through these
 * schemas, so a handler cannot return a shape they deny, and the browser's types are
 * inferred from them rather than typed out again beside them (`PB-D07`).
 *
 * Money crosses as a string because minor units are `bigint` and JSON has no bigint. Dates
 * cross as the strings Postgres `date` columns hold. Neither is parsed here — the screen
 * that formats them parses them, once.
 */

import { z } from 'zod';
import { CURRENCY_CODES, GENDERS, ROLES, SALARY_REASONS, SLICE_GROUPS } from './domain';

/** Minor units as a string: JSON has no integer wide enough to be trusted with money. */
export const moneyWire = z.strictObject({
  amountMinor: z.string(),
  currencyCode: z.enum(CURRENCY_CODES),
});

export const employeeListItem = z.strictObject({
  id: z.number(),
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  gender: z.enum(GENDERS),
  countryCode: z.string(),
  departmentId: z.number(),
  jobLevelId: z.number(),
  hireDate: z.string(),
  terminationDate: z.string().nullable(),
  status: z.enum(['active', 'left']),
});

export const employeePage = z.strictObject({
  employees: z.array(employeeListItem),
  nextCursor: z.string().nullable(),
});

export const salaryRecordWire = moneyWire.extend({
  id: z.number(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  reason: z.enum(SALARY_REASONS),
});

export const employeeDetail = z.strictObject({
  employee: employeeListItem.extend({
    managerId: z.number().nullable(),
    departmentName: z.string(),
    jobLevelName: z.string(),
  }),
  salaryHistory: z.array(salaryRecordWire),
  currentSalary: moneyWire.nullable(),
  band: z.strictObject({ min: moneyWire, mid: moneyWire, max: moneyWire }).nullable(),
  compRatio: z.number().nullable(),
  rangePenetration: z.number().nullable(),
});

/**
 * A band row carries one currency for its three figures, so they are bare minor-unit
 * strings rather than three `moneyWire`s repeating it.
 */
export const bandRow = z.strictObject({
  jobLevelId: z.number(),
  jobLevelName: z.string(),
  countryCode: z.string(),
  currencyCode: z.enum(CURRENCY_CODES),
  minMinor: z.string(),
  midMinor: z.string(),
  maxMinor: z.string(),
  headcount: z.number(),
});

export const bandsReport = z.strictObject({ bands: z.array(bandRow) });

/** The four points `docs/glossary.md` names, in USD minor units. Null means no salaries. */
export const percentilesWire = z.strictObject({
  p25: z.string(),
  p50: z.string(),
  p75: z.string(),
  p90: z.string(),
});

export const distributionGroup = z.strictObject({
  key: z.string(),
  name: z.string(),
  headcount: z.number(),
  percentiles: percentilesWire.nullable(),
});

export const distributionReport = z.strictObject({
  groupBy: z.enum(SLICE_GROUPS),
  currency: z.literal('USD'),
  groups: z.array(distributionGroup),
});

/** A half-open comp-ratio bucket. A null end is the open one: below the first, above the last. */
export const compRatioBucket = z.strictObject({
  from: z.number().nullable(),
  to: z.number().nullable(),
});

export const compRatioSummary = z.strictObject({
  headcount: z.number(),
  /** The people with a band — the only ones a comp ratio exists for. */
  measured: z.number(),
  unbanded: z.number(),
  /** One count per bucket, in the order the response lists them. */
  counts: z.array(z.number()),
});

export const compRatioReport = z.strictObject({
  groupBy: z.enum(SLICE_GROUPS),
  buckets: z.array(compRatioBucket),
  overall: compRatioSummary,
  groups: z.array(compRatioSummary.extend({ key: z.string(), name: z.string() })),
});

export const outlierRow = z.strictObject({
  employeeId: z.number(),
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  countryCode: z.string(),
  departmentName: z.string(),
  jobLevelName: z.string(),
  salary: moneyWire,
  compRatio: z.number().nullable(),
});

/** Four lists, not one with a label: the fourth is a gap in the band table, not a person's pay. */
export const outliersReport = z.strictObject({
  threshold: z.strictObject({ min: z.number(), max: z.number() }),
  belowBand: z.array(outlierRow),
  aboveBand: z.array(outlierRow),
  compRatioOutOfRange: z.array(outlierRow),
  noBand: z.array(outlierRow),
});

/**
 * A gap, or a stated refusal to publish one. `suppressed` carries `reason` and leaves both
 * figures null — never a zero, which would read as "no gap" (`docs/glossary.md`).
 */
export const payGapWire = z.strictObject({
  headcount: z.number(),
  compared: z.strictObject({ male: z.number(), female: z.number() }),
  excluded: z.number(),
  suppressed: z.boolean(),
  reason: z.string().nullable(),
  meanGap: z.number().nullable(),
  medianGap: z.number().nullable(),
});

export const payGapReport = z.strictObject({
  groupBy: z.enum(SLICE_GROUPS),
  currency: z.literal('USD'),
  minGroupSize: z.number(),
  overall: payGapWire,
  groups: z.array(payGapWire.extend({ key: z.string(), name: z.string() })),
});

export const referenceData = z.strictObject({
  currencies: z.array(z.string()).readonly(),
  genders: z.array(z.string()).readonly(),
  salaryReasons: z.array(z.string()).readonly(),
  countries: z.array(z.strictObject({ code: z.string(), name: z.string() })),
  departments: z.array(z.strictObject({ id: z.number(), name: z.string() })),
  jobLevels: z.array(z.strictObject({ id: z.number(), name: z.string() })),
});

/**
 * `role` travels so the browser can stop offering a write it is going to be refused. It
 * decides nothing: the API enforces the same role on every write it serves, and a screen
 * that drew the button anyway would still get a 403.
 */
export const sessionUser = z.strictObject({
  user: z.strictObject({
    id: z.number(),
    email: z.string(),
    displayName: z.string(),
    role: z.enum(ROLES),
  }),
});

/** `ask` is false on a server started without a key, and the ask bar reads it. */
export const health = z.strictObject({ status: z.literal('ok'), ask: z.boolean() });

/**
 * `POST /ask`: one member per analytics endpoint, carrying exactly the parameters that
 * endpoint already takes. `report` is the URL path segment, so a translated query names the
 * route that runs it. Every member is strict: an invented key is a refusal rather than a
 * field quietly dropped on the way to a report that then answers a different question.
 *
 * It lives here rather than in the API because the ask bar switches on `report` and the
 * switch has to stop compiling the day a sixth report is added. Hand-copied beside the
 * browser's own union, it did not — which is the falsifier decision 53 named for itself.
 */
export const askQuery = z.discriminatedUnion('report', [
  z.strictObject({
    report: z.literal('bands'),
    country: z.string().length(2).optional(),
    level: z.number().int().positive().optional(),
  }),
  z.strictObject({ report: z.literal('distribution'), groupBy: z.enum(SLICE_GROUPS) }),
  z.strictObject({ report: z.literal('comp-ratio'), groupBy: z.enum(SLICE_GROUPS) }),
  z.strictObject({ report: z.literal('pay-gap'), groupBy: z.enum(SLICE_GROUPS) }),
  z.strictObject({ report: z.literal('outliers') }),
]);

/**
 * The query travels beside the numbers because the screen has to show what the question was
 * understood to mean. `result` is whatever report the query named, and each of the five
 * already carries a schema on its own route; checking it here for being JSON catches a
 * report handing back a bigint without restating a union that goes stale the day a report
 * gains a field.
 */
export const askAnswer = z.strictObject({ query: askQuery, result: z.json() });

export type MoneyWire = z.infer<typeof moneyWire>;
export type EmployeeListItem = z.infer<typeof employeeListItem>;
export type EmployeePage = z.infer<typeof employeePage>;
export type SalaryRecordWire = z.infer<typeof salaryRecordWire>;
export type EmployeeDetail = z.infer<typeof employeeDetail>;
export type BandRow = z.infer<typeof bandRow>;
export type BandsReport = z.infer<typeof bandsReport>;
export type PercentilesWire = z.infer<typeof percentilesWire>;
export type DistributionGroup = z.infer<typeof distributionGroup>;
export type DistributionReport = z.infer<typeof distributionReport>;
export type CompRatioBucket = z.infer<typeof compRatioBucket>;
export type CompRatioSummary = z.infer<typeof compRatioSummary>;
export type CompRatioReport = z.infer<typeof compRatioReport>;
export type OutlierRow = z.infer<typeof outlierRow>;
export type OutliersReport = z.infer<typeof outliersReport>;
export type PayGapWire = z.infer<typeof payGapWire>;
export type PayGapReport = z.infer<typeof payGapReport>;
export type ReferenceData = z.infer<typeof referenceData>;
export type SessionUser = z.infer<typeof sessionUser>;
export type Health = z.infer<typeof health>;
export type AskQuery = z.infer<typeof askQuery>;
export type AskAnswer = z.infer<typeof askAnswer>;
