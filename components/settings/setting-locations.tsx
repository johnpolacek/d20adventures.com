"use client"

import * as React from "react"
import { Location, Organization } from "@/types/setting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ImageUpload } from "@/components/ui/image-upload"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface SettingLocationsProps {
  settingId: string
  locations: Location[]
  isSaving: boolean
  onLocationsChange: (locations: Location[]) => void
}

export function SettingLocations({ settingId, locations, isSaving, onLocationsChange }: SettingLocationsProps) {
  const [openLocations, setOpenLocations] = React.useState<Set<number>>(new Set())
  const [openOrganizations, setOpenOrganizations] = React.useState<Set<string>>(new Set())

  const toggleLocation = (index: number) => {
    setOpenLocations((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const toggleOrganization = (locationIndex: number, orgIndex: number) => {
    const key = `${locationIndex}-${orgIndex}`
    setOpenOrganizations((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const addLocation = () => {
    const newLocation: Location = {
      name: "",
      description: "",
      image: "",
      history: "",
      inhabitants: "",
      organizations: [],
    }
    onLocationsChange([...locations, newLocation])
  }

  const removeLocation = (index: number) => {
    const newLocations = locations.filter((_, i) => i !== index)
    onLocationsChange(newLocations)
    setOpenLocations((prev) => {
      const newSet = new Set(prev)
      newSet.delete(index)
      return newSet
    })
  }

  const updateLocation = (index: number, field: keyof Location, value: string | Organization[]) => {
    const newLocations = [...locations]
    newLocations[index] = { ...newLocations[index], [field]: value }
    onLocationsChange(newLocations)
  }

  const addOrganization = (locationIndex: number) => {
    const newOrg: Organization = {
      name: "",
      description: "",
      image: "",
    }
    const newLocations = [...locations]
    newLocations[locationIndex] = {
      ...newLocations[locationIndex],
      organizations: [...newLocations[locationIndex].organizations, newOrg],
    }
    onLocationsChange(newLocations)
  }

  const removeOrganization = (locationIndex: number, orgIndex: number) => {
    const newLocations = [...locations]
    newLocations[locationIndex] = {
      ...newLocations[locationIndex],
      organizations: newLocations[locationIndex].organizations.filter((_, i) => i !== orgIndex),
    }
    onLocationsChange(newLocations)
    const key = `${locationIndex}-${orgIndex}`
    setOpenOrganizations((prev) => {
      const newSet = new Set(prev)
      newSet.delete(key)
      return newSet
    })
  }

  const updateOrganization = (locationIndex: number, orgIndex: number, field: keyof Organization, value: string) => {
    const newLocations = [...locations]
    newLocations[locationIndex] = {
      ...newLocations[locationIndex],
      organizations: newLocations[locationIndex].organizations.map((org, i) => (i === orgIndex ? { ...org, [field]: value } : org)),
    }
    onLocationsChange(newLocations)
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-display font-bold text-primary-200">Locations</h3>
        <Button onClick={addLocation} size="sm" disabled={isSaving}>
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      </div>

      <div className="space-y-4">
        {locations.map((location, locationIndex) => (
          <Card key={locationIndex} className="bg-black/20 border-white/10">
            <Collapsible open={openLocations.has(locationIndex)} onOpenChange={() => toggleLocation(locationIndex)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer text-white hover:text-amber-300 transition-colors duration-500 ease-in-out">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-display">
                      {openLocations.has(locationIndex) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span>{location.name || `Location ${locationIndex + 1}`}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeLocation(locationIndex)
                      }}
                      disabled={isSaving}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="space-y-4 text-white">
                  <div className="grid grid-cols-2 gap-4 text-white">
                    <div>
                      <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">Location Image</Label>
                      <ImageUpload
                        value={location.image}
                        onChange={(url) => updateLocation(locationIndex, "image", url)}
                        onRemove={() => updateLocation(locationIndex, "image", "")}
                        folder={`images/settings/${settingId}/locations`}
                      />
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">Name</Label>
                        <Input value={location.name} onChange={(e) => updateLocation(locationIndex, "name", e.target.value)} placeholder="Location name..." disabled={isSaving} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">Description</Label>
                    <Textarea
                      value={location.description}
                      onChange={(e) => updateLocation(locationIndex, "description", e.target.value)}
                      placeholder="Describe this location..."
                      rows={3}
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">History</Label>
                    <Textarea
                      value={location.history}
                      onChange={(e) => updateLocation(locationIndex, "history", e.target.value)}
                      placeholder="Historical background of this location..."
                      rows={3}
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">Inhabitants</Label>
                    <Textarea
                      value={location.inhabitants}
                      onChange={(e) => updateLocation(locationIndex, "inhabitants", e.target.value)}
                      placeholder="Who lives in this location..."
                      rows={3}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-display font-bold text-primary-200">Organizations</h4>
                      <Button onClick={() => addOrganization(locationIndex)} size="sm" variant="outline" disabled={isSaving}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Organization
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {location.organizations.map((org, orgIndex) => (
                        <Card key={orgIndex} className="bg-black/30 border-white/5">
                          <Collapsible open={openOrganizations.has(`${locationIndex}-${orgIndex}`)} onOpenChange={() => toggleOrganization(locationIndex, orgIndex)}>
                            <CollapsibleTrigger asChild>
                              <CardHeader className="cursor-pointer hover:text-amber-300 text-white transition-colors py-3">
                                <CardTitle className="flex items-center justify-between text-base">
                                  <div className="flex items-center gap-2">
                                    {openOrganizations.has(`${locationIndex}-${orgIndex}`) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    <span>{org.name || `Organization ${orgIndex + 1}`}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeOrganization(locationIndex, orgIndex)
                                    }}
                                    disabled={isSaving}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </CardTitle>
                              </CardHeader>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <CardContent className="space-y-4 pt-0 text-white">
                                <div className="grid grid-cols-2 gap-4 text-white">
                                  <div>
                                    <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">Organization Image</Label>
                                    <ImageUpload
                                      value={org.image}
                                      onChange={(url) => updateOrganization(locationIndex, orgIndex, "image", url)}
                                      onRemove={() => updateOrganization(locationIndex, orgIndex, "image", "")}
                                      folder={`images/settings/${settingId}/organizations`}
                                    />
                                  </div>

                                  <div>
                                    <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">Name</Label>
                                    <Input
                                      value={org.name}
                                      onChange={(e) => updateOrganization(locationIndex, orgIndex, "name", e.target.value)}
                                      placeholder="Organization name..."
                                      disabled={isSaving}
                                    />
                                  </div>
                                </div>

                                <div className="text-white">
                                  <Label className="block text-sm font-medium font-mono text-primary-200/90 mb-1">Description</Label>
                                  <Textarea
                                    value={org.description}
                                    onChange={(e) => updateOrganization(locationIndex, orgIndex, "description", e.target.value)}
                                    placeholder="Describe this organization..."
                                    rows={3}
                                    disabled={isSaving}
                                  />
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}

        {locations.length === 0 && (
          <Card className="bg-black/20 border-white/10 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-gray-400 mb-4">No locations added yet.</p>
              <Button onClick={addLocation} disabled={isSaving}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Location
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
