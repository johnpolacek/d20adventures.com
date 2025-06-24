import { listAndReadJsonFilesInS3Directory } from "@/lib/s3-utils"
import { AdminBreadcrumb } from "@/components/nav/admin-breadcrumb"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import type { AdventurePlan } from "@/types/adventure-plan"

// Helper to get all plans from all settings
async function getAllAdventurePlans(): Promise<Array<{ key: string; plan: AdventurePlan }>> {
  // List all settings directories (hardcoded or via S3 if available)
  // For now, we can hardcode or scan known settings if needed
  // Example: ["realm-of-myr", "the_road_to_kordavos_adventure_plan", ...]
  // But ideally, we scan all directories under "settings/"
  // For simplicity, let's try a few known ones (expand as needed)
  const settingIds = ["realm-of-myr", "the_road_to_kordavos_adventure_plan", "covert-cargo", "the-march-of-davos-plan", "the-midnight-summons"]
  const allPlans: Array<{ key: string; plan: AdventurePlan }> = []
  for (const settingId of settingIds) {
    try {
      const files = await listAndReadJsonFilesInS3Directory(`settings/${settingId}/`, ["setting-data.json"])
      for (const file of files) {
        allPlans.push({ key: file.key, plan: file.data as AdventurePlan })
      }
    } catch (err) {
      console.error("Error listing and reading JSON files in S3 directory:", err)
      // Ignore missing settings
    }
  }
  return allPlans
}

export default async function AdminAdventurePlansPage() {
  const plans = await getAllAdventurePlans()

  return (
    <div className="container py-8">
      <AdminBreadcrumb items={[{ label: "Adventure Plans" }]} />
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-display text-amber-400">Adventure Plans</h1>
        <p className="font-mono text-primary-300">Manage and view all adventure plans</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plan ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Setting ID</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Draft?</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map(({ key, plan }) => (
            <TableRow key={key}>
              <TableCell>{plan.id}</TableCell>
              <TableCell>{plan.title}</TableCell>
              <TableCell>{plan.author}</TableCell>
              <TableCell>{plan.settingId}</TableCell>
              <TableCell>{plan.version}</TableCell>
              <TableCell>{plan.draft ? "Yes" : "No"}</TableCell>
              <TableCell>
                <a href={`/settings/${plan.settingId}/${plan.id}/edit`} target="_blank" rel="noopener noreferrer">
                  <Button className="text-xs" variant="outline" size="sm">
                    Edit
                  </Button>
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
