import { type Feature, type FeatureRequest, RoadmapView } from "@/components/admin/roadmap-view"
import initialRequests from "./data/featureRequests.json"
import initialFeatures from "./data/features.json"

export default function RoadmapPage() {
  const features = initialFeatures as Feature[]
  const featureRequests = initialRequests as FeatureRequest[]

  return <RoadmapView features={features} featureRequests={featureRequests} />
}
