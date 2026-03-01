import { Button, Input, Select, Table, Badge, toast } from '@medusajs/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { sdk } from '../../../../lib/sdk'
import type { PricingRecord, PricingFilters } from '../types'
import { DEFAULT_FILTERS } from '../types'
import { PricingFormModal } from './pricing-form-modal'

interface PricingTableProps {
  endpoint: string
  queryKey: string
  title: string
}

type SortKey = keyof PricingRecord
type SortDir = 'asc' | 'desc'

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (key: SortKey) => void
}) {
  const active = currentKey === sortKey
  return (
    <Table.HeaderCell
      className="cursor-pointer select-none hover:bg-ui-bg-base-hover"
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active && <span className="text-xs">{currentDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </Table.HeaderCell>
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatPrice(price: number): string {
  return `€ ${price.toFixed(2)}`
}

export function PricingTable({ endpoint, queryKey, title }: PricingTableProps) {
  const queryClientHook = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: [queryKey],
    queryFn: () => sdk.client.fetch<{ records: PricingRecord[]; count: number }>(endpoint),
  })

  const [filters, setFilters] = useState<PricingFilters>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('provider')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [editRecord, setEditRecord] = useState<PricingRecord | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredRecords = useMemo(() => {
    let records = data?.records ?? []

    if (filters.provider) {
      const q = filters.provider.toLowerCase()
      records = records.filter((r) => r.provider.toLowerCase().includes(q))
    }
    if (filters.forConsument !== 'all') {
      const val = filters.forConsument === 'true'
      records = records.filter((r) => r.forConsument === val)
    }
    if (filters.tarrifType !== 'all') {
      records = records.filter((r) => r.tarrifType === filters.tarrifType)
    }
    if (filters.fromCountry) {
      const q = filters.fromCountry.toLowerCase()
      records = records.filter((r) => r.fromCountry.toLowerCase().includes(q))
    }
    if (filters.toCountry) {
      const q = filters.toCountry.toLowerCase()
      records = records.filter((r) => r.toCountry.toLowerCase().includes(q))
    }
    if (filters.activeOn) {
      const date = new Date(filters.activeOn)
      records = records.filter((r) => {
        const from = new Date(r.validFrom)
        const to = r.validTo ? new Date(r.validTo) : null
        return from <= date && (!to || to >= date)
      })
    }

    records.sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      const dir = sortDir === 'asc' ? 1 : -1
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
      if (typeof aVal === 'boolean' && typeof bVal === 'boolean')
        return (Number(aVal) - Number(bVal)) * dir
      return String(aVal).localeCompare(String(bVal)) * dir
    })

    return records
  }, [data, filters, sortKey, sortDir])

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await sdk.client.fetch(`${endpoint}/${id}`, { method: 'DELETE' })
      toast.success('Record deleted')
      queryClientHook.invalidateQueries({ queryKey: [queryKey] })
    } catch {
      toast.error('Failed to delete record')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const handleSaved = () => {
    setShowCreate(false)
    setEditRecord(null)
    queryClientHook.invalidateQueries({ queryKey: [queryKey] })
  }

  if (error) {
    return (
      <div className="py-8 text-center text-ui-fg-muted">
        Failed to load {title.toLowerCase()}. Please try again.
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <label className="text-xs text-ui-fg-muted mb-1 block">Provider</label>
          <Input
            size="small"
            placeholder="Filter provider..."
            value={filters.provider}
            onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))}
          />
        </div>
        <div className="w-36">
          <label className="text-xs text-ui-fg-muted mb-1 block">Audience</label>
          <Select
            size="small"
            value={filters.forConsument}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, forConsument: v as PricingFilters['forConsument'] }))
            }
          >
            <Select.Trigger>
              <Select.Value placeholder="All" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All</Select.Item>
              <Select.Item value="true">Consumer</Select.Item>
              <Select.Item value="false">Business</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="w-36">
          <label className="text-xs text-ui-fg-muted mb-1 block">Tariff Type</label>
          <Select
            size="small"
            value={filters.tarrifType}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, tarrifType: v as PricingFilters['tarrifType'] }))
            }
          >
            <Select.Trigger>
              <Select.Value placeholder="All" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All</Select.Item>
              <Select.Item value="packet_type">Packet Type</Select.Item>
              <Select.Item value="weight">Weight</Select.Item>
              <Select.Item value="pallet">Pallet</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="w-32">
          <label className="text-xs text-ui-fg-muted mb-1 block">From Country</label>
          <Input
            size="small"
            placeholder="From..."
            value={filters.fromCountry}
            onChange={(e) => setFilters((f) => ({ ...f, fromCountry: e.target.value }))}
          />
        </div>
        <div className="w-32">
          <label className="text-xs text-ui-fg-muted mb-1 block">To Country</label>
          <Input
            size="small"
            placeholder="To..."
            value={filters.toCountry}
            onChange={(e) => setFilters((f) => ({ ...f, toCountry: e.target.value }))}
          />
        </div>
        <div className="w-40">
          <label className="text-xs text-ui-fg-muted mb-1 block">Active On</label>
          <Input
            size="small"
            type="date"
            value={filters.activeOn}
            onChange={(e) => setFilters((f) => ({ ...f, activeOn: e.target.value }))}
          />
        </div>
        <Button variant="secondary" size="small" onClick={() => setFilters(DEFAULT_FILTERS)}>
          Clear
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-ui-fg-muted">Loading...</div>
      ) : filteredRecords.length === 0 ? (
        <div className="py-12 text-center text-ui-fg-muted">
          No {title.toLowerCase()} found.
          <br />
          <Button
            variant="secondary"
            size="small"
            className="mt-3"
            onClick={() => setShowCreate(true)}
          >
            Add your first rate
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <Table.Header>
                <Table.Row>
                  <SortableHeader
                    label="Provider"
                    sortKey="provider"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Type"
                    sortKey="tarrifType"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Value"
                    sortKey="tariffValue"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <Table.HeaderCell>Audience</Table.HeaderCell>
                  <SortableHeader
                    label="From"
                    sortKey="fromCountry"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="To"
                    sortKey="toCountry"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Price"
                    sortKey="price"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Valid From"
                    sortKey="validFrom"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={toggleSort}
                  />
                  <Table.HeaderCell>Valid To</Table.HeaderCell>
                  <Table.HeaderCell>Sheet</Table.HeaderCell>
                  <Table.HeaderCell className="w-24">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredRecords.map((r) => (
                  <Table.Row key={r.id} className="hover:bg-ui-bg-base-hover">
                    <Table.Cell className="font-medium">{r.provider}</Table.Cell>
                    <Table.Cell>
                      <Badge
                        size="small"
                        color={
                          r.tarrifType === 'weight'
                            ? 'blue'
                            : r.tarrifType === 'pallet'
                              ? 'orange'
                              : 'green'
                        }
                      >
                        {r.tarrifType}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{r.tariffValue}</Table.Cell>
                    <Table.Cell>
                      <Badge size="small" color={r.forConsument ? 'purple' : 'grey'}>
                        {r.forConsument ? 'B2C' : 'B2B'}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{r.fromCountry}</Table.Cell>
                    <Table.Cell>{r.toCountry}</Table.Cell>
                    <Table.Cell className="font-mono">{formatPrice(r.price)}</Table.Cell>
                    <Table.Cell>{formatDate(r.validFrom)}</Table.Cell>
                    <Table.Cell>{formatDate(r.validTo)}</Table.Cell>
                    <Table.Cell className="text-ui-fg-muted text-xs">
                      {r.rateSheetCode ?? '—'}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-1">
                        <Button variant="secondary" size="small" onClick={() => setEditRecord(r)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="small" onClick={() => setDeleteId(r.id)}>
                          Del
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-ui-fg-muted">
            <span>
              {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
            </span>
            <Button variant="primary" size="small" onClick={() => setShowCreate(true)}>
              + Add Rate
            </Button>
          </div>
        </>
      )}

      <PricingFormModal
        open={showCreate || !!editRecord}
        record={editRecord}
        onClose={() => {
          setShowCreate(false)
          setEditRecord(null)
        }}
        onSaved={handleSaved}
        endpoint={endpoint}
      />

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-ui-bg-base rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete this rate?</h3>
            <p className="text-sm text-ui-fg-muted mb-6">
              This action cannot be undone. The pricing record will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="small"
                onClick={() => setDeleteId(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="small"
                onClick={() => handleDelete(deleteId)}
                isLoading={deleting}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
