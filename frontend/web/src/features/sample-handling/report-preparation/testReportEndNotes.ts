/** Standard disclaimer shown at the end of Part C — Test Results */
export const TEST_REPORT_END_MARKER = '------ End Report-----'

export const TEST_REPORT_END_NOTES: readonly string[] = [
  'Test Results Related only to the Parameter Tested.',
  'This Report shall not be Reproduced Except in Full without Prior Permission of the Laboartory.',
  'The Report can not be used as Evidance in the Court of Law without Written Approval of Laboratory.',
] as const

/** Single paragraph for display / print (1. … :: 2. … :: 3. …) */
export function formatTestReportEndNotesText(): string {
  return TEST_REPORT_END_NOTES.map((line, i) => `${i + 1}. ${line}`).join(' :: ')
}
