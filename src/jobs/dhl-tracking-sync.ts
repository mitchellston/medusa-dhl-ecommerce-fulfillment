import syncTrackingWorkflow from "../workflows/sync-tracking"

/**
 * Best-effort scheduled job.
 *
 * If you don't have the internal Medusa job runner enabled, you can instead
 * call the admin endpoint `POST /admin/dhl/tracking-sync` from an external cron.
 */
export const config = {
  name: "dhl-tracking-sync",
  // every 15 minutes
  schedule: "*/15 * * * *",
}

// Medusa passes a context object containing `container` in most job runner setups.
export default async function handler({ container }: { container: unknown }) {
  await syncTrackingWorkflow(container as any).run({
    input: { limit: 50, dry_run: false },
  })
}


