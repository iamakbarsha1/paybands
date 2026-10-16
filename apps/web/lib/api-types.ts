/**
 * The shapes the API answers with — inferred from the schemas the API serialises through,
 * not typed out again beside them (`PB-D07`). `@paybands/core` holds those schemas because
 * two layers depend on them, which is the same reason it already holds the write contracts
 * (decision 52).
 *
 * A field removed from a response is now a compile error in the screen that reads it, rather
 * than `undefined` at run time on a page nobody opened before the demo.
 *
 * Money crosses the wire as a string because minor units are `bigint` and JSON has no
 * bigint. It is parsed where it is formatted, never earlier.
 */

export type {
  BandRow,
  BandsReport,
  CompRatioBucket,
  CompRatioReport,
  CompRatioSummary,
  DistributionGroup,
  EmployeeDetail,
  EmployeeListItem,
  EmployeePage,
  Health,
  MoneyWire,
  OutlierRow,
  OutliersReport,
  PayGapReport,
  ReferenceData,
  SalaryRecordWire,
  SessionUser,
} from '@paybands/core';

import type { DistributionReport, PayGapWire, PercentilesWire } from '@paybands/core';

/** The screens call these two by the names they read best under: a group's points, and a gap. */
export type Percentiles = PercentilesWire;
export type PayGap = PayGapWire;

/** `/analytics/distribution`. Named for the report rather than the file it came from. */
export type Distribution = DistributionReport;

/**
 * `POST /ask`. The query stays hand-aligned with `apps/api/src/ask/query.ts`, because
 * decision 53 keeps the ask schema in the API, where its one enforcer is. `result` is the
 * report the query named, typed as `unknown` because the ask bar never renders it — the
 * report screen does, from its own endpoint.
 */
export type AskQuery =
  | { readonly report: 'bands'; readonly country?: string; readonly level?: number }
  | { readonly report: 'distribution'; readonly groupBy: 'country' | 'department' | 'level' }
  | { readonly report: 'comp-ratio'; readonly groupBy: 'country' | 'department' | 'level' }
  | { readonly report: 'pay-gap'; readonly groupBy: 'country' | 'department' | 'level' }
  | { readonly report: 'outliers' };

export interface AskAnswer {
  readonly query: AskQuery;
  readonly result: unknown;
}
