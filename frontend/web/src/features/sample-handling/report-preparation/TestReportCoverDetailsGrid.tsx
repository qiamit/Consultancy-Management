import { Input } from '@/components/ui/input'
import type { ReactNode } from 'react'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import { receivingReportSuffix } from '@/features/sample-handling/receiving/receivingSrfFromReference'
import {
  formatTestReportNumber,
  fromScopedReportNumberInput,
  reportNumberLastCharForScope,
  TEST_REPORT_TOTAL_LENGTH,
  TEST_REPORT_WITH_TYPE_LENGTH,
  toReportNumberForScope,
  withReceivingReportTypeSuffix,
} from './formattedTestReportNumber'
import {
  NABL_ULR_CHAR_LENGTH,
  nablUlrPlaceholder,
  sanitizeNablUlrInput,
  ULR_PREFIX_SETTING_NAMES,
} from './nablUlrNumber'
import type { ReportScopeKind } from './reportScope'
import { reportPartTableBaseCss } from './reportPartTypography'

const display = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

const CELL_INPUT =
  'h-auto min-h-0 w-full min-w-0 border-0 bg-transparent p-0 shadow-none font-bold tracking-wide focus-visible:ring-1 focus-visible:ring-amber-500/40 focus-visible:ring-offset-0 rounded-none'

function KvCells({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <>
      <td className="part-a-k">{label}</td>
      <td className="part-a-c">-</td>
      <td className="part-a-v">{children}</td>
    </>
  )
}

function FullRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <tr className="part-a-full">
      <td className="part-a-k">{label}</td>
      <td className="part-a-c">-</td>
      <td className="part-a-v" colSpan={4}>
        {children}
      </td>
    </tr>
  )
}

function TextValue({ value }: { value: string | null | undefined }) {
  return <>{display(value)}</>
}

export function TestReportCoverDetailsGrid({
  details,
  reportNumber,
  onReportNumberChange,
  testReportPrefix,
  reportNumberLoading,
  nablUlrNumber,
  onNablUlrNumberChange,
  ulrPrefix,
  ulrPrefixLoading,
  activeScope,
  disabled,
}: {
  details: TestReportCoverDetails
  reportNumber: string
  onReportNumberChange: (value: string) => void
  testReportPrefix: string
  reportNumberLoading: boolean
  nablUlrNumber: string
  onNablUlrNumberChange: (value: string) => void
  ulrPrefix: string
  ulrPrefixLoading: boolean
  activeScope: ReportScopeKind
  disabled?: boolean
}) {
  const showUlr = activeScope === 'nabl'
  const typeSuffix = receivingReportSuffix(details.reportType ?? '')
  const typedNumber = typeSuffix
    ? withReceivingReportTypeSuffix(reportNumber, details.reportType)
    : reportNumber
  const displayReportNumber = toReportNumberForScope(typedNumber, activeScope)
  const reportLastChars = typeSuffix
    ? `${reportNumberLastCharForScope(activeScope)}${typeSuffix}`
    : reportNumberLastCharForScope(activeScope)
  const reportMaxLength = typeSuffix ? TEST_REPORT_WITH_TYPE_LENGTH : TEST_REPORT_TOTAL_LENGTH
  const reportPlaceholder = testReportPrefix
    ? toReportNumberForScope(
        typeSuffix
          ? withReceivingReportTypeSuffix(formatTestReportNumber(testReportPrefix, 1), details.reportType)
          : formatTestReportNumber(testReportPrefix, 1),
        activeScope,
      )
    : '0'.repeat(Math.max(1, TEST_REPORT_TOTAL_LENGTH - 1)) + reportLastChars
  const ulrPlaceholder = nablUlrPlaceholder(ulrPrefix)

  const customerName = details.customerName ?? details.customerDetails
  const productTitle = details.isDetails ?? details.productTitle

  return (
    <div className="overflow-x-auto border-2 border-stone-500 bg-white p-2 shadow-sm ring-1 ring-amber-700/15 sm:p-3">
      <style>{`
        ${reportPartTableBaseCss('part-a-screen-table')}
        .part-a-screen-table .part-a-col-k { width: 24%; }
        .part-a-screen-table .part-a-col-c { width: 2%; }
        .part-a-screen-table .part-a-col-v { width: 24%; }
        .part-a-screen-table th,
        .part-a-screen-table td {
          border-top: 1px solid #000 !important;
          border-bottom: 1px solid #000 !important;
          border-left: none !important;
          border-right: none !important;
        }
        .part-a-screen-table th:first-child,
        .part-a-screen-table td:first-child {
          border-left: 1px solid #000 !important;
        }
        .part-a-screen-table th:last-child,
        .part-a-screen-table td:last-child {
          border-right: 1px solid #000 !important;
        }
        .part-a-screen-table td.part-a-v + td.part-a-k {
          border-left: 1px solid #000 !important;
        }
        .part-a-screen-table .part-a-c {
          text-align: center;
          padding-left: 0;
          padding-right: 0;
        }
        .part-a-screen-table .part-a-k {
          white-space: nowrap;
          word-break: keep-all;
          overflow-wrap: normal;
        }
        .part-a-screen-table th {
          text-transform: none;
        }
      `}</style>
      <table className="part-a-screen-table">
        <colgroup>
          <col className="part-a-col-k" />
          <col className="part-a-col-c" />
          <col className="part-a-col-v" />
          <col className="part-a-col-k" />
          <col className="part-a-col-c" />
          <col className="part-a-col-v" />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={6}>Part A. Particulars of Sample Submitted</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <KvCells label="Report Type">
              <TextValue value={details.reportType} />
            </KvCells>
            <KvCells label="Date of Reporting">
              <TextValue value={details.dateOfReporting} />
            </KvCells>
          </tr>

          {showUlr ? (
            <tr>
              <KvCells label="Report Number">
                <Input
                  id="part-a-report-number"
                  className={CELL_INPUT}
                  value={displayReportNumber}
                  onChange={(e) =>
                    onReportNumberChange(
                      typeSuffix
                        ? withReceivingReportTypeSuffix(e.target.value, details.reportType)
                        : fromScopedReportNumberInput(e.target.value, activeScope),
                    )
                  }
                  placeholder={reportPlaceholder}
                  maxLength={reportMaxLength}
                  disabled={disabled || reportNumberLoading}
                  title={`Part A · ends with ${reportLastChars}`}
                  aria-label="Report Number"
                />
              </KvCells>
              <KvCells label="ULR Number">
                <Input
                  id="part-a-ulr-number"
                  className={CELL_INPUT}
                  value={nablUlrNumber}
                  onChange={(e) => onNablUlrNumberChange(sanitizeNablUlrInput(e.target.value))}
                  placeholder={ulrPlaceholder}
                  maxLength={NABL_ULR_CHAR_LENGTH}
                  disabled={disabled || ulrPrefixLoading}
                  title={`NABL 18-position ULR (19 chars) · Part A · ${ULR_PREFIX_SETTING_NAMES.join(' / ')}`}
                  aria-label="ULR Number"
                />
              </KvCells>
            </tr>
          ) : (
            <FullRow label="Report Number">
              <Input
                id="part-a-report-number"
                className={CELL_INPUT}
                value={displayReportNumber}
                onChange={(e) =>
                  onReportNumberChange(
                    typeSuffix
                      ? withReceivingReportTypeSuffix(e.target.value, details.reportType)
                      : fromScopedReportNumberInput(e.target.value, activeScope),
                  )
                }
                placeholder={reportPlaceholder}
                maxLength={reportMaxLength}
                disabled={disabled || reportNumberLoading}
                title={`Part A · ends with ${reportLastChars}`}
                aria-label="Report Number"
              />
            </FullRow>
          )}

          <FullRow label="Customer Name">
            <TextValue value={customerName} />
          </FullRow>
          <FullRow label="Customer Address">
            <TextValue value={details.customerAddress} />
          </FullRow>
          <FullRow label="Product IS Code Title">
            <TextValue value={productTitle} />
          </FullRow>
          <FullRow label="Sample Description">
            <TextValue value={details.sampleDescription} />
          </FullRow>
          <FullRow label="Declared Values">
            <TextValue value={details.declaredValue} />
          </FullRow>

          <FullRow label="Batch Number">
            <TextValue value={details.batchNumber} />
          </FullRow>
          <FullRow label="Date of Manufacturing">
            <TextValue value={details.dateOfManufacturing?.trim() ? details.dateOfManufacturing : '---'} />
          </FullRow>
          <FullRow label="Sample Code">
            <TextValue value={details.sampleCode} />
          </FullRow>
          <FullRow label="QR Code / Bar Code">
            <TextValue value={details.sampleQrCode} />
          </FullRow>
          <tr>
            <KvCells label="BIS Seal">
              <TextValue value={details.bisSeal} />
            </KvCells>
            <KvCells label="IO's Signature">
              <TextValue value={details.ioSignature} />
            </KvCells>
          </tr>

          <FullRow label="Date of Sample Receipt">
            <TextValue value={details.dateOfSampleReceipt} />
          </FullRow>
          <FullRow label="Sample Quantity">
            <TextValue value={details.sampleQuantity} />
          </FullRow>
          <FullRow label="Nature of Sample">
            <TextValue value={details.natureOfSample} />
          </FullRow>
          <FullRow label="Section Code">
            <TextValue value={details.sectionCodes} />
          </FullRow>
          <FullRow label="Section Report No">
            <TextValue value={details.sectionReportNo} />
          </FullRow>
          <FullRow label="Date of Test Started">
            <TextValue value={details.dateOfTestingStarted} />
          </FullRow>
          <FullRow label="Date of Test Completed">
            <TextValue value={details.dateOfTestingCompleted} />
          </FullRow>
          <FullRow label="Party Reference No">
            <TextValue value={details.partyReferenceNo} />
          </FullRow>
          <FullRow label="Reference Report No">
            <TextValue value={details.referenceReportNo} />
          </FullRow>
          <FullRow label="Any Other Information">
            <TextValue value={details.anyOtherInformation} />
          </FullRow>
        </tbody>
      </table>
    </div>
  )
}
