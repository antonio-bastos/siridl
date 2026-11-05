import type { MunicipalStats, PotholeRecord } from "@/types/pothole"

/**
 * Creates an inline SVG data URI representing a vehicle dashcam view
 * with the detected road defect and an authentic YOLO bounding box overlay.
 */
function createDashcamSvg(
  road: string,
  time: string,
  confidence: number,
  severity: "critica" | "alta" | "media" | "baixa",
  box: { x: number; y: number; w: number; h: number },
  potholeStyle: "deep" | "wide" | "cluster"
): string {
  const color =
    severity === "critica"
      ? "#ef4444"
      : severity === "alta"
        ? "#f97316"
        : severity === "media"
          ? "#eab308"
          : "#10b981"

  const confPercent = (confidence * 100).toFixed(1)
  const holeColor =
    potholeStyle === "deep" ? "#0f172a" : potholeStyle === "wide" ? "#1e293b" : "#334155"

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="100%" height="100%">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#bae6fd" />
      </linearGradient>
      <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#475569" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="potholeDepth" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${holeColor}" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>
    </defs>

    <!-- Sky & Horizon -->
    <rect width="640" height="150" fill="url(#sky)" />
    
    <!-- Background Landscape & Trees -->
    <polygon points="0,150 140,135 280,150 420,138 560,150 640,142 640,155 0,155" fill="#15803d" opacity="0.85" />
    <polygon points="120,150 170,120 220,150" fill="#166534" />
    <polygon points="460,150 510,122 550,150" fill="#166534" />
    
    <!-- Road Surface Perspective -->
    <polygon points="260,150 380,150 640,360 0,360" fill="url(#road)" />

    <!-- Road Berms / Curbs -->
    <polygon points="0,360 260,150 250,150 0,360" fill="#64748b" opacity="0.6" />
    <polygon points="640,360 380,150 390,150 640,360" fill="#64748b" opacity="0.6" />

    <!-- Center Dashed Road Lines -->
    <polygon points="318,160 322,160 324,185 316,185" fill="#f8fafc" opacity="0.9" />
    <polygon points="315,200 325,200 327,240 313,240" fill="#f8fafc" opacity="0.9" />
    <polygon points="312,260 328,260 332,320 308,320" fill="#f8fafc" opacity="0.9" />

    <!-- Road Pothole Cavity Shadow and Cracks -->
    <ellipse cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2 + 6}" rx="${box.w / 2 - 4}" ry="${box.h / 2 - 8}" fill="url(#potholeDepth)" stroke="#090d16" stroke-width="3" />
    <path d="M${box.x + 8} ${box.y + box.h / 2} Q ${box.x + box.w / 2} ${box.y + 12} ${box.x + box.w - 10} ${box.y + box.h / 2 + 4}" stroke="#0f172a" stroke-width="2" fill="none" />
    <path d="M${box.x + 2} ${box.y + box.h / 2 + 2} L ${box.x - 12} ${box.y + box.h / 2 - 6}" stroke="#0f172a" stroke-width="1.5" />
    <path d="M${box.x + box.w - 4} ${box.y + box.h / 2 + 1} L ${box.x + box.w + 14} ${box.y + box.h / 2 + 8}" stroke="#0f172a" stroke-width="1.5" />

    <!-- YOLO Detection Bounding Box -->
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="0" rx="3" />
    
    <!-- Corner Accents -->
    <path d="M${box.x} ${box.y + 10} L${box.x} ${box.y} L${box.x + 10} ${box.y}" stroke="${color}" stroke-width="3" fill="none" />
    <path d="M${box.x + box.w - 10} ${box.y} L${box.x + box.w} ${box.y} L${box.x + box.w} ${box.y + 10}" stroke="${color}" stroke-width="3" fill="none" />
    <path d="M${box.x} ${box.y + box.h - 10} L${box.x} ${box.y + box.h} L${box.x + 10} ${box.y + box.h}" stroke="${color}" stroke-width="3" fill="none" />
    <path d="M${box.x + box.w - 10} ${box.y + box.h} L${box.x + box.w} ${box.y + box.h} L${box.x + box.w} ${box.y + box.h - 10}" stroke="${color}" stroke-width="3" fill="none" />

    <!-- Class & Confidence Badge -->
    <rect x="${box.x}" y="${Math.max(8, box.y - 24)}" width="148" height="22" fill="${color}" rx="3" />
    <text x="${box.x + 6}" y="${Math.max(8, box.y - 24) + 15}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="11" font-weight="700">
      buraco: ${confPercent}%
    </text>

    <!-- Dashcam HUD Watermark -->
    <rect x="12" y="12" width="230" height="26" fill="#000000" opacity="0.65" rx="4" />
    <circle cx="24" cy="25" r="4" fill="#ef4444" />
    <text x="34" y="29" fill="#f8fafc" font-family="monospace" font-size="10.5" font-weight="600">
      REC · SIRI-DL · ${time}
    </text>

    <!-- Bottom Metadata Bar -->
    <rect x="0" y="332" width="640" height="28" fill="#020617" opacity="0.8" />
    <text x="14" y="350" fill="#e2e8f0" font-family="monospace" font-size="10.5">
      GPS: CM Loulé · ${road}
    </text>
  </svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const DUMMY_POTHOLES: PotholeRecord[] = [
  {
    id: "BUR-2026-001",
    road: "Av. 25 de Abril, Loulé (junto ao Tribunal)",
    parish: "Loulé (São Clemente)",
    municipality: "Loulé",
    lat: 37.1394,
    lng: -8.0242,
    severity: "critica",
    confidence: 0.942,
    areaPercentage: 4.8,
    estimatedDepthCm: 7,
    estimatedDiameterCm: 68,
    status: "pendente",
    detectedAt: "Hoje, 09:42",
    detectedTime: "09:42:18",
    vehicleId: "CM-04",
    vehicleType: "Viatura Fiscalização Municipal",
    speedKmh: 38,
    weather: "Sol / Pavimento Seco",
    notes:
      "Buraco profundo na faixa direita junto à passadeira de peões. Risco iminente de corte de pneu e instabilidade para veículos de duas rodas.",
    bbox: [220, 210, 390, 310],
    imageSvg: createDashcamSvg(
      "Av. 25 de Abril",
      "09:42:18",
      0.942,
      "critica",
      { x: 230, y: 220, w: 155, h: 80 },
      "deep"
    ),
  },
  {
    id: "BUR-2026-002",
    road: "EN125 - Km 87.4 (Troço Quatro Estradas / Maritenda)",
    parish: "São Sebastião",
    municipality: "Loulé",
    lat: 37.0982,
    lng: -8.0645,
    severity: "critica",
    confidence: 0.918,
    areaPercentage: 3.6,
    estimatedDepthCm: 6,
    estimatedDiameterCm: 55,
    status: "em_reparacao",
    detectedAt: "Ontem, 16:15",
    detectedTime: "16:15:04",
    vehicleId: "RSU-12",
    vehicleType: "Carrinha Recolha Resíduos",
    speedKmh: 64,
    weather: "Nublado",
    notes:
      "Fissura alargada com desagregação acentuada de betuminoso em faixa de rodagem de alta velocidade (80 km/h). Brigada enviada.",
    workOrderId: "OP-2026-089",
    assignedCrew: "Equipa de Conservação Rodoviária Sul",
    bbox: [280, 230, 440, 320],
    imageSvg: createDashcamSvg(
      "EN125 - Km 87.4",
      "16:15:04",
      0.918,
      "critica",
      { x: 270, y: 225, w: 145, h: 75 },
      "deep"
    ),
  },
  {
    id: "BUR-2026-003",
    road: "Av. José da Costa Mealha (Centro Urbano)",
    parish: "Loulé (São Clemente)",
    municipality: "Loulé",
    lat: 37.1378,
    lng: -8.0215,
    severity: "media",
    confidence: 0.884,
    areaPercentage: 1.4,
    estimatedDepthCm: 3,
    estimatedDiameterCm: 35,
    status: "pendente",
    detectedAt: "Hoje, 11:20",
    detectedTime: "11:20:55",
    vehicleId: "PIQ-02",
    vehicleType: "Viatura Piquete de Obras",
    speedKmh: 24,
    weather: "Sol",
    notes:
      "Abatimento na berma contígua a sarjeta de escoamento pluvial. Requer selagem para evitar expansão estrutural.",
    bbox: [180, 240, 310, 315],
    imageSvg: createDashcamSvg(
      "Av. Costa Mealha",
      "11:20:55",
      0.884,
      "media",
      { x: 190, y: 240, w: 110, h: 65 },
      "wide"
    ),
  },
  {
    id: "BUR-2026-004",
    road: "Rua de Portugal (São Clemente)",
    parish: "Loulé (São Clemente)",
    municipality: "Loulé",
    lat: 37.1421,
    lng: -8.0195,
    severity: "alta",
    confidence: 0.931,
    areaPercentage: 2.5,
    estimatedDepthCm: 5,
    estimatedDiameterCm: 48,
    status: "pendente",
    detectedAt: "Hoje, 08:35",
    detectedTime: "08:35:12",
    vehicleId: "CM-04",
    vehicleType: "Viatura Fiscalização Municipal",
    speedKmh: 31,
    weather: "Sol",
    notes:
      "Cavidade aberta diretamente no rodado direito das viaturas. Provoca solavanco significativo nos autocarros urbanos.",
    bbox: [320, 220, 480, 310],
    imageSvg: createDashcamSvg(
      "Rua de Portugal",
      "08:35:12",
      0.931,
      "alta",
      { x: 310, y: 220, w: 130, h: 70 },
      "deep"
    ),
  },
  {
    id: "BUR-2026-005",
    road: "EM522 - Estrada de Querença (Curva dos Pinheiros)",
    parish: "Querença",
    municipality: "Loulé",
    lat: 37.1856,
    lng: -7.9862,
    severity: "alta",
    confidence: 0.895,
    areaPercentage: 2.8,
    estimatedDepthCm: 5,
    estimatedDiameterCm: 52,
    status: "em_reparacao",
    detectedAt: "03/11/2026, 14:10",
    detectedTime: "14:10:40",
    vehicleId: "RUR-01",
    vehicleType: "Carrinha Manutenção Rural",
    speedKmh: 45,
    weather: "Céu Limpo",
    notes:
      "Degradação progressiva da berma com intrusão de 40 cm na faixa de rodagem em curva cega com pouca visibilidade.",
    workOrderId: "OP-2026-077",
    assignedCrew: "Brigada de Pavimentação Norte",
    bbox: [140, 230, 290, 320],
    imageSvg: createDashcamSvg(
      "EM522 - Querença",
      "14:10:40",
      0.895,
      "alta",
      { x: 150, y: 235, w: 125, h: 75 },
      "wide"
    ),
  },
  {
    id: "BUR-2026-006",
    road: "Av. Tivoli, Vilamoura",
    parish: "Quarteira",
    municipality: "Loulé",
    lat: 37.0784,
    lng: -8.1189,
    severity: "baixa",
    confidence: 0.852,
    areaPercentage: 0.4,
    estimatedDepthCm: 2,
    estimatedDiameterCm: 22,
    status: "reparado",
    detectedAt: "02/11/2026, 17:05",
    detectedTime: "17:05:22",
    vehicleId: "CM-02",
    vehicleType: "Viatura Fiscalização Municipal",
    speedKmh: 42,
    weather: "Sol",
    notes:
      "Fissura inicial superficial. Intervenção rápida concluída pela brigada com selagem de asfalto a frio.",
    workOrderId: "OP-2026-062",
    assignedCrew: "Intervenção Rápida Quarteira",
    bbox: [240, 250, 340, 310],
    imageSvg: createDashcamSvg(
      "Av. Tivoli, Vilamoura",
      "17:05:22",
      0.852,
      "baixa",
      { x: 250, y: 250, w: 90, h: 45 },
      "cluster"
    ),
  },
  {
    id: "BUR-2026-007",
    road: "Rua do Comércio, Almancil",
    parish: "Almancil",
    municipality: "Loulé",
    lat: 37.0867,
    lng: -8.0315,
    severity: "media",
    confidence: 0.902,
    areaPercentage: 1.8,
    estimatedDepthCm: 4,
    estimatedDiameterCm: 40,
    status: "pendente",
    detectedAt: "Ontem, 20:45",
    detectedTime: "20:45:19",
    vehicleId: "RSU-09",
    vehicleType: "Carrinha Recolha Resíduos",
    speedKmh: 28,
    weather: "Noite / Iluminação Pública",
    notes:
      "Desnível pronunciado no eixo da via originado após fortes chuvadas na zona de Almancil.",
    bbox: [260, 230, 390, 310],
    imageSvg: createDashcamSvg(
      "Rua do Comércio, Almancil",
      "20:45:19",
      0.902,
      "media",
      { x: 265, y: 230, w: 120, h: 65 },
      "wide"
    ),
  },
  {
    id: "BUR-2026-008",
    road: "Estrada da Rocha da Pena (Salir)",
    parish: "Salir",
    municipality: "Loulé",
    lat: 37.2481,
    lng: -8.0934,
    severity: "critica",
    confidence: 0.961,
    areaPercentage: 5.2,
    estimatedDepthCm: 9,
    estimatedDiameterCm: 75,
    status: "pendente",
    detectedAt: "Hoje, 07:50",
    detectedTime: "07:50:08",
    vehicleId: "SAP-03",
    vehicleType: "Viatura Sapadores Florestais",
    speedKmh: 36,
    weather: "Nevoeiro Matinal",
    notes:
      "Buraco de dimensão muito crítica com brita solta e desnível de 9 cm. Já foram reportados 2 danos em jantes de condutores locais.",
    bbox: [210, 200, 420, 320],
    imageSvg: createDashcamSvg(
      "Estrada Rocha da Pena",
      "07:50:08",
      0.961,
      "critica",
      { x: 215, y: 210, w: 175, h: 95 },
      "deep"
    ),
  },
  {
    id: "BUR-2026-009",
    road: "Av. Dr. Francisco Sá Carneiro (Marginal de Quarteira)",
    parish: "Quarteira",
    municipality: "Loulé",
    lat: 37.0695,
    lng: -8.1023,
    severity: "baixa",
    confidence: 0.835,
    areaPercentage: 0.3,
    estimatedDepthCm: 1.5,
    estimatedDiameterCm: 20,
    status: "reparado",
    detectedAt: "01/11/2026, 10:15",
    detectedTime: "10:15:33",
    vehicleId: "POL-01",
    vehicleType: "Polícia Municipal",
    speedKmh: 35,
    weather: "Sol",
    notes:
      "Desagregação superficial de betuminoso. Selagem de acabamento concluída.",
    workOrderId: "OP-2026-051",
    assignedCrew: "Intervenção Rápida Quarteira",
    bbox: [300, 260, 390, 315],
    imageSvg: createDashcamSvg(
      "Marginal de Quarteira",
      "10:15:33",
      0.835,
      "baixa",
      { x: 305, y: 260, w: 80, h: 40 },
      "cluster"
    ),
  },
  {
    id: "BUR-2026-010",
    road: "Estrada de Vale do Lobo, Almancil",
    parish: "Almancil",
    municipality: "Loulé",
    lat: 37.0632,
    lng: -8.0512,
    severity: "media",
    confidence: 0.879,
    areaPercentage: 1.2,
    estimatedDepthCm: 3.5,
    estimatedDiameterCm: 32,
    status: "pendente",
    detectedAt: "Hoje, 12:05",
    detectedTime: "12:05:44",
    vehicleId: "CM-04",
    vehicleType: "Viatura Fiscalização Municipal",
    speedKmh: 50,
    weather: "Sol",
    notes:
      "Depressão circular na faixa no sentido Almancil - Praias. Sem danos estruturais graves mas com desconforto na condução.",
    bbox: [240, 235, 360, 305],
    imageSvg: createDashcamSvg(
      "Estrada Vale do Lobo",
      "12:05:44",
      0.879,
      "media",
      { x: 245, y: 235, w: 105, h: 58 },
      "wide"
    ),
  },
  {
    id: "BUR-2026-011",
    road: "Rua de São Sebastião, Boliqueime",
    parish: "Boliqueime",
    municipality: "Loulé",
    lat: 37.132,
    lng: -8.143,
    severity: "alta",
    confidence: 0.925,
    areaPercentage: 2.2,
    estimatedDepthCm: 4.8,
    estimatedDiameterCm: 44,
    status: "pendente",
    detectedAt: "Hoje, 13:14",
    detectedTime: "13:14:02",
    vehicleId: "RSU-12",
    vehicleType: "Carrinha Recolha Resíduos",
    speedKmh: 32,
    weather: "Sol",
    notes:
      "Desnível na aproximação ao cruzamento central. Necessita reforço de massa asfáltica.",
    bbox: [250, 225, 380, 310],
    imageSvg: createDashcamSvg(
      "Boliqueime - S. Sebastião",
      "13:14:02",
      0.925,
      "alta",
      { x: 255, y: 225, w: 115, h: 68 },
      "deep"
    ),
  },
  {
    id: "BUR-2026-012",
    road: "Caminho dos Cascalhos, Benafim",
    parish: "Benafim",
    municipality: "Loulé",
    lat: 37.214,
    lng: -8.121,
    severity: "critica",
    confidence: 0.948,
    areaPercentage: 4.1,
    estimatedDepthCm: 8,
    estimatedDiameterCm: 60,
    status: "pendente",
    detectedAt: "Hoje, 10:50",
    detectedTime: "10:50:31",
    vehicleId: "RUR-01",
    vehicleType: "Carrinha Manutenção Rural",
    speedKmh: 28,
    weather: "Sol",
    notes:
      "Erosão grave no asfalto com arestas vivas. Provoca desvio súbito de viaturas para a faixa contrária.",
    bbox: [220, 215, 380, 315],
    imageSvg: createDashcamSvg(
      "Benafim - Cascalhos",
      "10:50:31",
      0.948,
      "critica",
      { x: 230, y: 215, w: 140, h: 85 },
      "deep"
    ),
  },
]

export function getMunicipalStats(potholes: PotholeRecord[]): MunicipalStats {
  const totalPotholes = potholes.length
  const criticalCount = potholes.filter((p) => p.severity === "critica").length
  const highCount = potholes.filter((p) => p.severity === "alta").length
  const mediumCount = potholes.filter((p) => p.severity === "media").length
  const lowCount = potholes.filter((p) => p.severity === "baixa").length

  const pendingCount = potholes.filter((p) => p.status === "pendente").length
  const inRepairCount = potholes.filter((p) => p.status === "em_reparacao").length
  const repairedCount = potholes.filter((p) => p.status === "reparado").length

  return {
    totalPotholes,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    pendingCount,
    inRepairCount,
    repairedCount,
    monitoredKm: 184.6,
    activeVehicles: 4,
  }
}
