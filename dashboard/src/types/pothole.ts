export type PotholeSeverity = "critica" | "alta" | "media" | "baixa"
export type PotholeStatus = "pendente" | "em_reparacao" | "reparado"

export interface PotholeRecord {
  id: string
  road: string
  parish: string
  municipality: string
  lat: number
  lng: number
  severity: PotholeSeverity
  confidence: number // e.g. 0.94 (94%)
  areaPercentage: number // e.g. 4.8% of camera lane
  estimatedDepthCm: number // e.g. 7 cm
  estimatedDiameterCm: number // e.g. 65 cm
  status: PotholeStatus
  detectedAt: string
  detectedTime: string
  vehicleId: string
  vehicleType: string
  speedKmh: number
  weather: string
  notes: string
  workOrderId?: string
  assignedCrew?: string
  bbox: [number, number, number, number] // [x1, y1, x2, y2]
  imageSvg: string // SVG data URI simulating the dashcam photo with YOLO bounding box
}

export interface MunicipalStats {
  totalPotholes: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  pendingCount: number
  inRepairCount: number
  repairedCount: number
  monitoredKm: number
  activeVehicles: number
}
