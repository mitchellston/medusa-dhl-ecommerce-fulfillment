import { Button, Badge, Input, Label, Table, toast, clx } from '@medusajs/ui'
import { useState, useMemo } from 'react'
import { sdk } from '../../../../lib/sdk'
import type { ParseResult, ImportMode, ImportCommitResult } from '../types'

interface ImportDialogProps {
  onClose: () => void
  onImported: () => void
}

type Step = 'upload' | 'parsing' | 'preview' | 'committing' | 'done'

function formatPrice(price: number): string {
  return `€ ${price.toFixed(2)}`
}

export function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>('upsert')
  const [validTo, setValidTo] = useState('')

  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [previewFilter, setPreviewFilter] = useState<
    'all' | 'base' | 'extra' | 'errors' | 'duplicates'
  >('all')

  const filteredPreviewRows = useMemo(() => {
    if (!parseResult) return []
    let rows = parseResult.rows
    switch (previewFilter) {
      case 'base':
        rows = rows.filter((r) => r.targetTable === 'pricing_manual')
        break
      case 'extra':
        rows = rows.filter((r) => r.targetTable === 'pricing_manual_extra')
        break
      case 'errors':
        rows = rows.filter((r) => r.errors.length > 0)
        break
      case 'duplicates':
        rows = rows.filter((r) => r.isDuplicate)
        break
    }
    return rows
  }, [parseResult, previewFilter])

  const stats = useMemo(() => {
    if (!parseResult) return null
    const rows = parseResult.rows
    return {
      total: rows.length,
      base: rows.filter((r) => r.targetTable === 'pricing_manual').length,
      extra: rows.filter((r) => r.targetTable === 'pricing_manual_extra').length,
      errors: rows.filter((r) => r.errors.length > 0).length,
      duplicates: rows.filter((r) => r.isDuplicate).length,
      selected: selectedRows.size,
    }
  }, [parseResult, selectedRows])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setError(null)
  }

  const handleParse = async () => {
    if (!file) return
    setStep('parsing')
    setError(null)

    try {
      const base64 = await fileToBase64(file)
      const result = await sdk.client.fetch<ParseResult>('/admin/dhl/pricing/import/parse', {
        method: 'POST',
        body: { pdfBase64: base64 },
      })

      setParseResult(result)
      const initialSelected = new Set<number>()
      result.rows.forEach((r) => {
        if (r.errors.length === 0) initialSelected.add(r.rowIndex)
      })
      setSelectedRows(initialSelected)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse PDF')
      setStep('upload')
    }
  }

  const handleCommit = async () => {
    if (!parseResult) return
    setStep('committing')
    setError(null)

    const rowsToCommit = parseResult.rows.filter((r) => selectedRows.has(r.rowIndex))

    try {
      const result = await sdk.client.fetch<ImportCommitResult>(
        '/admin/dhl/pricing/import/commit',
        {
          method: 'POST',
          body: {
            mode,
            rateSheetCode: parseResult.rateSheetCode,
            validFrom: parseResult.validFrom,
            validTo: validTo || null,
            rows: rowsToCommit.map((r) => ({
              forConsument: r.forConsument,
              tarrifType: r.tarrifType,
              tariffValue: r.tariffValue,
              provider: r.provider,
              fromCountry: r.fromCountry,
              toCountry: r.toCountry,
              price: r.price,
              validFrom: r.validFrom,
              validTo: validTo ? new Date(validTo).toISOString() : r.validTo,
              rateSheetCode: r.rateSheetCode,
              targetTable: r.targetTable,
            })),
          },
        },
      )

      setCommitResult(result)
      setStep('done')

      if (result.failed === 0) {
        toast.success(`Import complete: ${result.created} created, ${result.updated} updated`)
      } else {
        toast.error(`Import finished with ${result.failed} error(s)`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  const toggleRow = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  const toggleAll = () => {
    const validRows = filteredPreviewRows.filter((r) => r.errors.length === 0)
    const allSelected = validRows.every((r) => selectedRows.has(r.rowIndex))
    setSelectedRows((prev) => {
      const next = new Set(prev)
      validRows.forEach((r) => {
        if (allSelected) next.delete(r.rowIndex)
        else next.add(r.rowIndex)
      })
      return next
    })
  }

  const downloadErrorReport = () => {
    if (!commitResult) return
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        created: commitResult.created,
        updated: commitResult.updated,
        skipped: commitResult.skipped,
        failed: commitResult.failed,
      },
      errors: commitResult.errors,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dhl-import-errors-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-ui-bg-base rounded-lg shadow-xl w-[95vw] max-w-7xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Import DHL PDF</h2>
          <Button variant="secondary" size="small" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="max-w-lg mx-auto space-y-6">
              <div>
                <Label>PDF File</Label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-ui-bg-base-hover file:text-ui-fg-base hover:file:bg-ui-bg-base-pressed cursor-pointer"
                />
              </div>

              <div>
                <Label>Import Mode</Label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      value="upsert"
                      checked={mode === 'upsert'}
                      onChange={() => setMode('upsert')}
                      className="accent-ui-fg-interactive"
                    />
                    <div>
                      <span className="text-sm font-medium">Upsert by logical key</span>
                      <p className="text-xs text-ui-fg-muted">
                        Update existing records matching provider + type + value + countries, create
                        new ones otherwise
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      value="new_version"
                      checked={mode === 'new_version'}
                      onChange={() => setMode('new_version')}
                      className="accent-ui-fg-interactive"
                    />
                    <div>
                      <span className="text-sm font-medium">Insert as new version</span>
                      <p className="text-xs text-ui-fg-muted">
                        Create all records as new entries with rateSheetCode + validFrom
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <Label>Valid To (optional)</Label>
                <Input
                  type="datetime-local"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                />
                <p className="text-xs text-ui-fg-muted mt-1">
                  Set an end date for all imported rates. Leave empty for no expiry.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded bg-ui-bg-base-hover border border-ui-border-error text-sm text-ui-fg-error">
                  {error}
                </div>
              )}

              <Button onClick={handleParse} disabled={!file} className="w-full">
                Parse PDF
              </Button>
            </div>
          )}

          {step === 'parsing' && (
            <div className="py-16 text-center text-ui-fg-muted">
              <div className="text-lg mb-2">Parsing PDF...</div>
              <p className="text-sm">Extracting rates from the DHL rate sheet.</p>
            </div>
          )}

          {step === 'preview' && parseResult && stats && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Badge color="grey">Total: {stats.total}</Badge>
                <Badge color="blue">Base: {stats.base}</Badge>
                <Badge color="orange">Extra: {stats.extra}</Badge>
                <Badge color="red">Errors: {stats.errors}</Badge>
                <Badge color="purple">Duplicates: {stats.duplicates}</Badge>
                <Badge color="green">Selected: {stats.selected}</Badge>
              </div>

              {parseResult.globalWarnings.length > 0 && (
                <div className="p-3 rounded bg-yellow-50 border border-yellow-200 text-sm">
                  <strong>Warnings:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {parseResult.globalWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Label className="mr-2 self-center">Filter:</Label>
                {(['all', 'base', 'extra', 'errors', 'duplicates'] as const).map((f) => (
                  <Button
                    key={f}
                    size="small"
                    variant={previewFilter === f ? 'primary' : 'secondary'}
                    onClick={() => setPreviewFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={
                    filteredPreviewRows.filter((r) => r.errors.length === 0).length > 0 &&
                    filteredPreviewRows
                      .filter((r) => r.errors.length === 0)
                      .every((r) => selectedRows.has(r.rowIndex))
                  }
                  onChange={toggleAll}
                  className="accent-ui-fg-interactive"
                />
                <span className="text-sm text-ui-fg-muted">
                  Select/deselect all visible valid rows
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border max-h-[50vh] overflow-y-auto">
                <Table>
                  <Table.Header className="sticky top-0 bg-ui-bg-base z-10">
                    <Table.Row>
                      <Table.HeaderCell className="w-10" />
                      <Table.HeaderCell>Table</Table.HeaderCell>
                      <Table.HeaderCell>Provider</Table.HeaderCell>
                      <Table.HeaderCell>Type</Table.HeaderCell>
                      <Table.HeaderCell>Value</Table.HeaderCell>
                      <Table.HeaderCell>From</Table.HeaderCell>
                      <Table.HeaderCell>To</Table.HeaderCell>
                      <Table.HeaderCell>Price</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredPreviewRows.map((row) => {
                      const hasErrors = row.errors.length > 0
                      return (
                        <Table.Row
                          key={row.rowIndex}
                          className={clx(
                            hasErrors && 'bg-red-50',
                            row.isDuplicate && !hasErrors && 'bg-yellow-50',
                          )}
                        >
                          <Table.Cell>
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.rowIndex)}
                              onChange={() => toggleRow(row.rowIndex)}
                              disabled={hasErrors}
                              className="accent-ui-fg-interactive"
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <Badge
                              size="small"
                              color={row.targetTable === 'pricing_manual' ? 'blue' : 'orange'}
                            >
                              {row.targetTable === 'pricing_manual' ? 'Base' : 'Extra'}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell className="text-xs">{row.provider}</Table.Cell>
                          <Table.Cell>
                            <Badge size="small" color="grey">
                              {row.tarrifType}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell>{row.tariffValue}</Table.Cell>
                          <Table.Cell className="text-xs">{row.fromCountry}</Table.Cell>
                          <Table.Cell className="text-xs">{row.toCountry}</Table.Cell>
                          <Table.Cell className="font-mono text-xs">
                            {formatPrice(row.price)}
                          </Table.Cell>
                          <Table.Cell>
                            {hasErrors ? (
                              <span className="text-xs text-red-600" title={row.errors.join(', ')}>
                                {row.errors.join('; ')}
                              </span>
                            ) : row.isDuplicate ? (
                              <span className="text-xs text-yellow-600">Duplicate</span>
                            ) : row.warnings.length > 0 ? (
                              <span
                                className="text-xs text-yellow-600"
                                title={row.warnings.join(', ')}
                              >
                                Warning
                              </span>
                            ) : (
                              <span className="text-xs text-green-600">OK</span>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      )
                    })}
                  </Table.Body>
                </Table>
              </div>

              {error && (
                <div className="p-3 rounded border border-ui-border-error text-sm text-ui-fg-error">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <div className="text-sm text-ui-fg-muted">
                  {stats.selected} of {stats.total} rows selected for import
                  {mode === 'upsert' ? ' (upsert mode)' : ' (new version mode)'}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep('upload')}>
                    Back
                  </Button>
                  <Button onClick={handleCommit} disabled={stats.selected === 0}>
                    Import {stats.selected} Rows
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'committing' && (
            <div className="py-16 text-center text-ui-fg-muted">
              <div className="text-lg mb-2">Importing...</div>
              <p className="text-sm">Saving rates to the database.</p>
            </div>
          )}

          {step === 'done' && commitResult && (
            <div className="max-w-lg mx-auto space-y-6 py-8">
              <h3 className="text-lg font-semibold text-center">Import Complete</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-green-50 text-center">
                  <div className="text-2xl font-bold text-green-700">{commitResult.created}</div>
                  <div className="text-sm text-green-600">Created</div>
                </div>
                <div className="p-4 rounded-lg bg-blue-50 text-center">
                  <div className="text-2xl font-bold text-blue-700">{commitResult.updated}</div>
                  <div className="text-sm text-blue-600">Updated</div>
                </div>
                <div className="p-4 rounded-lg bg-gray-50 text-center">
                  <div className="text-2xl font-bold text-gray-700">{commitResult.skipped}</div>
                  <div className="text-sm text-gray-600">Skipped</div>
                </div>
                <div className="p-4 rounded-lg bg-red-50 text-center">
                  <div className="text-2xl font-bold text-red-700">{commitResult.failed}</div>
                  <div className="text-sm text-red-600">Failed</div>
                </div>
              </div>

              {commitResult.errors.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Errors:</h4>
                  <div className="max-h-40 overflow-y-auto text-sm space-y-1">
                    {commitResult.errors.map((e, i) => (
                      <div key={i} className="text-red-600">
                        Row {e.rowIndex}: {e.message}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    className="mt-2"
                    onClick={downloadErrorReport}
                  >
                    Download Error Report
                  </Button>
                </div>
              )}

              <Button className="w-full" onClick={onImported}>
                Done
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      if (base64) resolve(base64)
      else reject(new Error('Failed to read file as base64'))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
