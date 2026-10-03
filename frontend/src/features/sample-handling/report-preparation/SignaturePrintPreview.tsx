import { cn } from '@/lib/utils'
import {
  TEST_REPORT_SIGNATURE_PART_IDS,
  TEST_REPORT_SIGNATURE_PART_LABELS,
  formatSignatureDesignationLine,
  signaturesForPart,
  type TestReportPrintSettings,
  type TestReportSignature,
} from '@/features/settings/lab-settings/printSettingsTypes'

function SignatureCellPreview({ sig }: { sig: TestReportSignature }) {
  const roleLabel = sig.roleLabel.trim()
  const name = sig.name.trim() || '—'
  const designation = formatSignatureDesignationLine(sig)

  return (
    <div className="inline-flex w-[10.75rem] max-w-[12rem] flex-col items-center bg-transparent px-1.5 py-1.5 text-center font-[Times_New_Roman,Times,serif] text-black">
      {roleLabel ? (
        <div className="text-[9pt] font-bold tracking-[0.02em]">{roleLabel}</div>
      ) : null}
      <div className="mt-7 w-full max-w-[8.5rem] border-t border-black" aria-hidden />
      <div className="mt-1.5 text-[11pt] font-bold italic leading-tight">{name}</div>
      <div className="mt-0.5 text-[9pt] italic leading-tight">{designation}</div>
    </div>
  )
}

function SignatureRow({ signatures }: { signatures: TestReportSignature[] }) {
  const count = signatures.length
  if (count === 0) return null

  if (count === 4) {
    const [left, c1, c2, right] = signatures
    return (
      <div className="flex items-start justify-between gap-x-3">
        <SignatureCellPreview sig={left} />
        <div className="flex flex-1 items-start justify-center gap-x-6">
          <SignatureCellPreview sig={c1} />
          <SignatureCellPreview sig={c2} />
        </div>
        <SignatureCellPreview sig={right} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-x-4 gap-y-6',
        count === 1 ? 'justify-end' : 'justify-between',
      )}
    >
      {signatures.map((sig, index) => (
        <SignatureCellPreview
          key={`${sig.userId || sig.name || 'sig'}-${index}`}
          sig={sig}
        />
      ))}
    </div>
  )
}

export function SignaturePrintPreview({
  settings,
  className,
}: {
  settings: Pick<TestReportPrintSettings, 'showSignatures' | 'signatures' | 'signatureAfterParts'>
  className?: string
}) {
  const partsWithSigs = TEST_REPORT_SIGNATURE_PART_IDS.map((part) => ({
    part,
    signatures: signaturesForPart(settings, part),
  })).filter((row) => row.signatures.length > 0)

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
        Signature line preview
      </p>
      <div className="overflow-x-auto border border-stone-400 bg-white p-3 shadow-sm">
        <style>{`
          .sig-preview-wrap {
            font-family: "Times New Roman", Times, serif;
            color: #000;
            line-height: 1.25;
          }
        `}</style>
        <div className="sig-preview-wrap space-y-4">
          {!settings.showSignatures ? (
            <p className="py-6 text-center text-sm font-semibold text-stone-500">
              Signatures are hidden on print / PDF
            </p>
          ) : partsWithSigs.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-stone-500">
              Tick Select + Required, assign person, and choose Show after A/B/C/D on a signatory
            </p>
          ) : (
            <>
              {partsWithSigs.map(({ part, signatures }) => (
                <div key={part} className="space-y-2">
                  <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    After {TEST_REPORT_SIGNATURE_PART_LABELS[part]}
                  </p>
                  <SignatureRow signatures={signatures} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
