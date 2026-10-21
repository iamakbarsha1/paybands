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
  AskAnswer,
  AskQuery,
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
  Role,
  SalaryRecordWire,
  SessionUser,
} from '@paybands/core';

import type { DistributionReport, PayGapWire, PercentilesWire } from '@paybands/core';

/** The screens call these two by the names they read best under: a group's points, and a gap. */
export type Percentiles = PercentilesWire;
export type PayGap = PayGapWire;

/** `/analytics/distribution`. Named for the report rather than the file it came from. */
export type Distribution = DistributionReport;
