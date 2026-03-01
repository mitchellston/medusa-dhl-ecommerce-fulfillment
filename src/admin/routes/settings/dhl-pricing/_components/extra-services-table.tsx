import { Button, Input, Table, toast } from '@medusajs/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { sdk } from '../../../../lib/sdk'
import type { ExtraServiceRecord } from '../types'
import { ExtraServiceFormModal } from './extra-service-form-modal'

const QUERY_KEY = 'dhl-extra-services'
const ENDPOINT = '/admin/dhl/pricing/extra-services'

function formatPrice(price: number): string {
  return `€ ${price.toFixed(2)}`
}

export function ExtraServicesTable() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => sdk.client.fetch<{ records: ExtraServiceRecord[]; count: number }>(ENDPOINT),
  })

  const [search, setSearch] = useState('')
  const [editRecord, setEditRecord] = useState<ExtraServiceRecord | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filteredRecords = useMemo(() => {
    let records = data?.records ?? []
    if (search) {
      const q = search.toLowerCase()
      records = records.filter((r) => r.service.toLowerCase().includes(q))
    }
    return records.sort((a, b) => a.service.localeCompare(b.service))
  }, [data, search])

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await sdk.client.fetch(`${ENDPOINT}/${id}`, { method: 'DELETE' })
      toast.success('Extra service deleted')
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    } catch {
      toast.error('Failed to delete extra service')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const handleSaved = () => {
    setShowCreate(false)
    setEditRecord(null)
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
  }

  if (error) {
    return (
      <div className="py-8 text-center text-ui-fg-muted">
        Failed to load extra services. Please try again.
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex gap-3 items-end">
        <div className="w-64">
          <label className="text-xs text-ui-fg-muted mb-1 block">Search service</label>
          <Input
            size="small"
            placeholder="Filter by service name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <Button variant="secondary" size="small" onClick={() => setSearch('')}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-ui-fg-muted">Loading...</div>
      ) : filteredRecords.length === 0 ? (
        <div className="py-12 text-center text-ui-fg-muted">
          No extra services found.
          <br />
          <Button
            variant="secondary"
            size="small"
            className="mt-3"
            onClick={() => setShowCreate(true)}
          >
            Add your first extra service
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Service</Table.HeaderCell>
                  <Table.HeaderCell>Price (excl. VAT)</Table.HeaderCell>
                  <Table.HeaderCell className="w-24">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredRecords.map((r) => (
                  <Table.Row key={r.id} className="hover:bg-ui-bg-base-hover">
                    <Table.Cell className="font-medium">{r.service}</Table.Cell>
                    <Table.Cell className="font-mono">{formatPrice(r.price)}</Table.Cell>
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
              {filteredRecords.length} service{filteredRecords.length !== 1 ? 's' : ''}
            </span>
            <Button variant="primary" size="small" onClick={() => setShowCreate(true)}>
              + Add Service
            </Button>
          </div>
        </>
      )}

      <ExtraServiceFormModal
        open={showCreate || !!editRecord}
        record={editRecord}
        onClose={() => {
          setShowCreate(false)
          setEditRecord(null)
        }}
        onSaved={handleSaved}
      />

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-ui-bg-base rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete this extra service?</h3>
            <p className="text-sm text-ui-fg-muted mb-6">This action cannot be undone.</p>
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
