/** pnpm content:sync: two-way sync of content/queue with the private data bucket. */
import { syncQueue } from "../lib/content-queue/sync"

syncQueue().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
