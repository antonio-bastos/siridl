/**
 * SIRI-DL — Modelo de Dados de Entradas de Auditoria Rodoviária
 * Registos municipais do Concelho de Loulé (Quarteira, Vilamoura, Almancil, Loulé)
 */

export type TipoAnomalia =
  | "Buraco no Pavimento"
  | "Fissura Longitudinal"
  | "Tampa de Esgoto Desnivelada"
  | "Sinalização Danificada";

export type EstadoEntrada = "Pendente" | "Agendado" | "Em Reparação" | "Resolvido";

export type GravidadeNivel = "Baixa" | "Média" | "Crítica";

export type ClassificacaoVia = "Av. Marginal" | "Urb. Arterial" | "EN 125" | "Rua Local";

export type GestaoCompetencia =
  | "Câmara Municipal de Loulé"
  | "Infraestruturas de Portugal (IP)"
  | "Concessionária (Via do Infante / Subconcessão)";

export const FREGUESIA_LIST = [
  "Quarteira",
  "Almancil",
  "São Clemente",
  "São Sebastião",
  "Boliqueime",
  "Alte",
  "Salir",
  "Ameixial",
  "Tôr",
  "Vilamoura",
] as const;

export const GESTAO_FILTER_OPTIONS: { value: GestaoCompetencia; label: string }[] = [
  { value: "Câmara Municipal de Loulé", label: "CML — Municipal" },
  { value: "Infraestruturas de Portugal (IP)", label: "Infraestruturas de Portugal" },
  { value: "Concessionária (Via do Infante / Subconcessão)", label: "Concessão" },
];

export interface YoloBBoxOverlay {
  /** Normalized percentages (0–100) for responsive SVG bounding box rendering */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  className: string;
}

export interface ProximidadeSensivel {
  nome: string;
  tipo: "Escola" | "Hospital" | "Rotunda" | "Passadeira";
  distanciaM: number;
  gravidadeBase: GravidadeNivel;
}

export interface EntradaAnomalia {
  id: string;
  tipo: TipoAnomalia;
  confianca: number; // 0 to 1
  rua: string;
  freguesia: string;
  classificacaoVia: ClassificacaoVia;
  roadnumber?: string;
  categoria?: string;
  nVias?: string;
  gestao?: GestaoCompetencia;
  slaExempt?: boolean;
  coberturaPct: number; // e.g. 0.78 to 3.45
  profundidadeCm?: number;
  areaEstimadaM2: number;
  areaEstimadaCm2: number;
  nitidezScore?: number;
  proximidadeSensivel?: ProximidadeSensivel;
  estado: EstadoEntrada;
  ultimaDetecaoIso: string;
  ultimaDetecaoLabel: string;
  recorrencia: number;
  lat: number;
  lng: number;
  viatura: string;
  imagemUrl: string;
  thumbPosition: string;
  bbox: YoloBBoxOverlay;
  notas?: string;
}

export function getGravidade(
  coberturaPct: number,
  areaEstimadaCm2?: number,
  proximidadeSensivel?: ProximidadeSensivel,
): GravidadeNivel {
  let base: GravidadeNivel;
  if (typeof areaEstimadaCm2 === "number" && Number.isFinite(areaEstimadaCm2)) {
    if (areaEstimadaCm2 >= 1500) base = "Crítica";
    else if (areaEstimadaCm2 >= 450) base = "Média";
    else base = "Baixa";
  } else {
    if (coberturaPct >= 2.4) base = "Crítica";
    else if (coberturaPct >= 1.35) base = "Média";
    else base = "Baixa";
  }

  if (proximidadeSensivel && proximidadeSensivel.distanciaM <= 100) {
    if (base === "Baixa") return "Média";
    if (base === "Média") return "Crítica";
  }
  return base;
}

export const TIPO_ANOMALIA_LIST: TipoAnomalia[] = [
  "Buraco no Pavimento",
  "Fissura Longitudinal",
  "Tampa de Esgoto Desnivelada",
  "Sinalização Danificada",
];

export const ESTADO_LIST: EstadoEntrada[] = [
  "Pendente",
  "Agendado",
  "Em Reparação",
  "Resolvido",
];

export const GRAVIDADE_LIST: GravidadeNivel[] = ["Baixa", "Média", "Crítica"];

export const CLASSIFICACAO_VIA_LIST: ClassificacaoVia[] = [
  "Av. Marginal",
  "Urb. Arterial",
  "EN 125",
  "Rua Local",
];

export const ENTRADAS_MOCK_DATA: EntradaAnomalia[] = [
  {
    id: "ANM-101",
    tipo: "Buraco no Pavimento",
    confianca: 0.942,
    rua: "Av. Infante de Sagres",
    freguesia: "Quarteira",
    classificacaoVia: "Av. Marginal",
    coberturaPct: 3.45,
    areaEstimadaM2: 0.48,
    areaEstimadaCm2: 4800,
    nitidezScore: 248.4,
    proximidadeSensivel: {
      nome: "Passadeira Av. Infante de Sagres",
      tipo: "Passadeira",
      distanciaM: 18,
      gravidadeBase: "Crítica",
    },
    estado: "Pendente",
    ultimaDetecaoIso: "2026-11-14T09:42:00Z",
    ultimaDetecaoLabel: "14 Nov 2026, 09:42",
    recorrencia: 5,
    lat: 37.0689,
    lng: -8.1014,
    viatura: "Frota RSU #03",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "65% 68%",
    bbox: { xPct: 47.6, yPct: 63.2, wPct: 41.7, hPct: 25.8, className: "buraco" },
    notas: "Cavidade profunda junto à passadeira frente ao Passeio das Dunas.",
  },
  {
    id: "ANM-102",
    tipo: "Buraco no Pavimento",
    confianca: 0.918,
    rua: "EN 125 (Km 98,4)",
    freguesia: "Almancil",
    classificacaoVia: "EN 125",
    roadnumber: "EN125",
    categoria: "Estrada Nacional",
    nVias: "2",
    gestao: "Infraestruturas de Portugal (IP)",
    slaExempt: true,
    coberturaPct: 3.12,
    areaEstimadaM2: 0.42,
    areaEstimadaCm2: 4200,
    nitidezScore: 215.7,
    estado: "Em Reparação",
    ultimaDetecaoIso: "2026-11-14T08:55:00Z",
    ultimaDetecaoLabel: "14 Nov 2026, 08:55",
    recorrencia: 7,
    lat: 37.0861,
    lng: -8.0342,
    viatura: "Viatura Fiscalização #01",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "42% 55%",
    bbox: { xPct: 22.8, yPct: 48.3, wPct: 42.6, hPct: 13.6, className: "buraco" },
    notas: "Degradação severa na faixa direita sentido Faro–Loulé.",
  },
  {
    id: "ANM-103",
    tipo: "Tampa de Esgoto Desnivelada",
    confianca: 0.886,
    rua: "Av. Vilamoura XXI",
    freguesia: "Vilamoura",
    classificacaoVia: "Urb. Arterial",
    coberturaPct: 2.64,
    areaEstimadaM2: 0.36,
    areaEstimadaCm2: 3600,
    nitidezScore: 192.0,
    estado: "Agendado",
    ultimaDetecaoIso: "2026-11-13T17:18:00Z",
    ultimaDetecaoLabel: "13 Nov 2026, 17:18",
    recorrencia: 4,
    lat: 37.0815,
    lng: -8.1219,
    viatura: "Viatura Fiscalização #02",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "55% 48%",
    bbox: { xPct: 41.5, yPct: 50.6, wPct: 23.4, hPct: 10.5, className: "tampa_desnivelada" },
    notas: "Abatimento de 5 cm no aro metálico de saneamento.",
  },
  {
    id: "ANM-104",
    tipo: "Fissura Longitudinal",
    confianca: 0.854,
    rua: "Av. Sá Carneiro",
    freguesia: "Quarteira",
    classificacaoVia: "Urb. Arterial",
    coberturaPct: 1.94,
    areaEstimadaM2: 0.12,
    areaEstimadaCm2: 1180,
    nitidezScore: 204.2,
    proximidadeSensivel: {
      nome: "Rotunda da Av. Sá Carneiro",
      tipo: "Rotunda",
      distanciaM: 64,
      gravidadeBase: "Média",
    },
    estado: "Pendente",
    ultimaDetecaoIso: "2026-11-14T07:30:00Z",
    ultimaDetecaoLabel: "14 Nov 2026, 07:30",
    recorrencia: 3,
    lat: 37.0724,
    lng: -8.0982,
    viatura: "Frota RSU #01",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "48% 22%",
    bbox: { xPct: 41.2, yPct: 17.0, wPct: 25.6, hPct: 4.9, className: "fissura" },
    notas: "Fissura contínua ao longo do eixo de rodagem.",
  },
  {
    id: "ANM-105",
    tipo: "Sinalização Danificada",
    confianca: 0.893,
    rua: "Rua Vasco da Gama",
    freguesia: "Quarteira",
    classificacaoVia: "Rua Local",
    coberturaPct: 1.48,
    areaEstimadaM2: 0.09,
    areaEstimadaCm2: 860,
    nitidezScore: 176.8,
    proximidadeSensivel: {
      nome: "Centro de Saúde de Quarteira",
      tipo: "Hospital",
      distanciaM: 82,
      gravidadeBase: "Média",
    },
    estado: "Agendado",
    ultimaDetecaoIso: "2026-11-13T15:05:00Z",
    ultimaDetecaoLabel: "13 Nov 2026, 15:05",
    recorrencia: 2,
    lat: 37.0702,
    lng: -8.1056,
    viatura: "Viatura Fiscalização #01",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "52% 18%",
    bbox: { xPct: 41.5, yPct: 17.9, wPct: 12.4, hPct: 2.8, className: "sinal_danificado" },
    notas: "Sinal vertical C1 inclinado após embate ligeiro.",
  },
  {
    id: "ANM-106",
    tipo: "Buraco no Pavimento",
    confianca: 0.961,
    rua: "Av. José da Costa Mealha",
    freguesia: "Loulé",
    classificacaoVia: "Urb. Arterial",
    coberturaPct: 2.89,
    areaEstimadaM2: 0.39,
    areaEstimadaCm2: 3900,
    nitidezScore: 261.3,
    proximidadeSensivel: {
      nome: "Passadeira Av. José da Costa Mealha",
      tipo: "Passadeira",
      distanciaM: 42,
      gravidadeBase: "Crítica",
    },
    estado: "Pendente",
    ultimaDetecaoIso: "2026-11-14T10:12:00Z",
    ultimaDetecaoLabel: "14 Nov 2026, 10:12",
    recorrencia: 6,
    lat: 37.1378,
    lng: -8.0211,
    viatura: "Frota RSU #04",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "68% 70%",
    bbox: { xPct: 47.6, yPct: 63.2, wPct: 41.7, hPct: 25.8, className: "buraco" },
    notas: "Cavidade junto à paragem de autocarro central.",
  },
  {
    id: "ANM-107",
    tipo: "Fissura Longitudinal",
    confianca: 0.782,
    rua: "Av. Cerro da Vila",
    freguesia: "Vilamoura",
    classificacaoVia: "Rua Local",
    coberturaPct: 0.92,
    areaEstimadaM2: 0.04,
    areaEstimadaCm2: 390,
    nitidezScore: 164.0,
    estado: "Resolvido",
    ultimaDetecaoIso: "2026-11-11T11:20:00Z",
    ultimaDetecaoLabel: "11 Nov 2026, 11:20",
    recorrencia: 2,
    lat: 37.0789,
    lng: -8.1174,
    viatura: "Viatura Fiscalização #03",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "35% 50%",
    bbox: { xPct: 22.8, yPct: 48.3, wPct: 42.6, hPct: 13.6, className: "fissura" },
    notas: "Selagem betuminosa concluída pela brigada municipal.",
  },
  {
    id: "ANM-108",
    tipo: "Buraco no Pavimento",
    confianca: 0.875,
    rua: "Rua 25 de Abril",
    freguesia: "Almancil",
    classificacaoVia: "Rua Local",
    coberturaPct: 2.46,
    areaEstimadaM2: 0.34,
    areaEstimadaCm2: 3400,
    nitidezScore: 229.5,
    proximidadeSensivel: {
      nome: "Passadeira Av. 5 de Outubro",
      tipo: "Passadeira",
      distanciaM: 89,
      gravidadeBase: "Crítica",
    },
    estado: "Pendente",
    ultimaDetecaoIso: "2026-11-13T16:40:00Z",
    ultimaDetecaoLabel: "13 Nov 2026, 16:40",
    recorrencia: 4,
    lat: 37.0872,
    lng: -8.0298,
    viatura: "Frota RSU #02",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "60% 62%",
    bbox: { xPct: 47.6, yPct: 63.2, wPct: 41.7, hPct: 25.8, className: "buraco" },
    notas: "Agregado solto com acumulação de água pluvial.",
  },
  {
    id: "ANM-109",
    tipo: "Tampa de Esgoto Desnivelada",
    confianca: 0.834,
    rua: "Av. Marçal Pacheco",
    freguesia: "Loulé",
    classificacaoVia: "Urb. Arterial",
    coberturaPct: 1.65,
    areaEstimadaM2: 0.11,
    areaEstimadaCm2: 1120,
    nitidezScore: 188.1,
    proximidadeSensivel: {
      nome: "Escola Secundária de Loulé",
      tipo: "Escola",
      distanciaM: 76,
      gravidadeBase: "Média",
    },
    estado: "Em Reparação",
    ultimaDetecaoIso: "2026-11-12T14:10:00Z",
    ultimaDetecaoLabel: "12 Nov 2026, 14:10",
    recorrencia: 3,
    lat: 37.1394,
    lng: -8.0245,
    viatura: "Viatura Fiscalização #02",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "52% 52%",
    bbox: { xPct: 41.5, yPct: 50.6, wPct: 23.4, hPct: 10.5, className: "tampa_desnivelada" },
    notas: "Nivelamento em curso com argamassa de presa rápida.",
  },
  {
    id: "ANM-110",
    tipo: "Fissura Longitudinal",
    confianca: 0.746,
    rua: "Av. da Marina",
    freguesia: "Vilamoura",
    classificacaoVia: "Av. Marginal",
    coberturaPct: 0.78,
    areaEstimadaM2: 0.03,
    areaEstimadaCm2: 320,
    nitidezScore: 152.9,
    estado: "Resolvido",
    ultimaDetecaoIso: "2026-11-10T09:15:00Z",
    ultimaDetecaoLabel: "10 Nov 2026, 09:15",
    recorrencia: 1,
    lat: 37.0756,
    lng: -8.1202,
    viatura: "Viatura Fiscalização #01",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "50% 15%",
    bbox: { xPct: 51.8, yPct: 13.1, wPct: 3.6, hPct: 0.9, className: "fissura" },
    notas: "Intervenção preventiva registada sem recorrência.",
  },
  {
    id: "ANM-111",
    tipo: "Buraco no Pavimento",
    confianca: 0.905,
    rua: "Estrada da Fonte Santa",
    freguesia: "Quarteira",
    classificacaoVia: "Urb. Arterial",
    coberturaPct: 2.18,
    areaEstimadaM2: 0.13,
    areaEstimadaCm2: 1340,
    nitidezScore: 210.6,
    proximidadeSensivel: {
      nome: "Rotunda do Polvo (Quarteira)",
      tipo: "Rotunda",
      distanciaM: 45,
      gravidadeBase: "Média",
    },
    estado: "Agendado",
    ultimaDetecaoIso: "2026-11-14T06:50:00Z",
    ultimaDetecaoLabel: "14 Nov 2026, 06:50",
    recorrencia: 3,
    lat: 37.0648,
    lng: -8.0884,
    viatura: "Frota RSU #03",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "38% 54%",
    bbox: { xPct: 22.8, yPct: 48.3, wPct: 42.6, hPct: 13.6, className: "buraco" },
    notas: "Rebordo irregular junto à rotunda de acesso.",
  },
  {
    id: "ANM-112",
    tipo: "Sinalização Danificada",
    confianca: 0.812,
    rua: "Rua Primeiro de Maio",
    freguesia: "Loulé",
    classificacaoVia: "Rua Local",
    coberturaPct: 1.05,
    areaEstimadaM2: 0.04,
    areaEstimadaCm2: 410,
    nitidezScore: 171.2,
    estado: "Resolvido",
    ultimaDetecaoIso: "2026-11-09T18:05:00Z",
    ultimaDetecaoLabel: "09 Nov 2026, 18:05",
    recorrencia: 2,
    lat: 37.1385,
    lng: -8.0189,
    viatura: "Viatura Fiscalização #03",
    imagemUrl: "/assets/reference.jpg",
    thumbPosition: "52% 20%",
    bbox: { xPct: 41.5, yPct: 17.9, wPct: 12.4, hPct: 2.8, className: "sinal_danificado" },
    notas: "Substituição de placa refletora efetuada.",
  },
];

export function exportEntradasToCsv(entries: EntradaAnomalia[], filename = "siridl-entradas.csv"): void {
  const headers = [
    "ID",
    "Tipo",
    "Confianca",
    "Rua",
    "Freguesia",
    "ClassificacaoVia",
    "CoberturaPct",
    "Gravidade",
    "AreaEstimadaCm2",
    "AreaEstimadaM2",
    "ProximidadeSensivel",
    "Estado",
    "UltimaDetecao",
    "Recorrencia",
    "Latitude",
    "Longitude",
    "Viatura",
  ];
  const rows = entries.map((e) => [
    e.id,
    `"${e.tipo}"`,
    (e.confianca * 100).toFixed(1) + "%",
    `"${e.rua}"`,
    e.freguesia,
    `"${e.classificacaoVia}"`,
    e.coberturaPct.toFixed(2),
    getGravidade(e.coberturaPct, e.areaEstimadaCm2, e.proximidadeSensivel),
    Math.round(e.areaEstimadaCm2),
    e.areaEstimadaM2.toFixed(2),
    e.proximidadeSensivel
      ? `"${e.proximidadeSensivel.tipo}: ${e.proximidadeSensivel.nome} (${e.proximidadeSensivel.distanciaM}m)"`
      : '""',
    e.estado,
    `"${e.ultimaDetecaoLabel}"`,
    e.recorrencia,
    e.lat.toFixed(6),
    e.lng.toFixed(6),
    `"${e.viatura}"`,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  triggerDownload(csv, filename, "text/csv;charset=utf-8;");
}

export function exportEntradasToGeoJson(entries: EntradaAnomalia[], filename = "siridl-entradas.geojson"): void {
  const fc = {
    type: "FeatureCollection",
    features: entries.map((e) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [e.lng, e.lat],
      },
      properties: {
        id: e.id,
        tipo: e.tipo,
        confianca: e.confianca,
        rua: e.rua,
        freguesia: e.freguesia,
        classificacaoVia: e.classificacaoVia,
        coberturaPct: e.coberturaPct,
        gravidade: getGravidade(e.coberturaPct, e.areaEstimadaCm2, e.proximidadeSensivel),
        areaEstimadaCm2: e.areaEstimadaCm2,
        areaEstimadaM2: e.areaEstimadaM2,
        proximidadeSensivel: e.proximidadeSensivel ?? null,
        estado: e.estado,
        ultimaDetecao: e.ultimaDetecaoIso,
        recorrencia: e.recorrencia,
        viatura: e.viatura,
      },
    })),
  };
  triggerDownload(JSON.stringify(fc, null, 2), filename, "application/geo+json;charset=utf-8;");
}

export function exportFichaTecnica(entry: EntradaAnomalia): void {
  const payload = {
    plataforma: "SIRI-DL · Câmara Municipal de Loulé",
    exportadoEm: new Date().toISOString(),
    registo: entry,
    gravidade: getGravidade(entry.coberturaPct, entry.areaEstimadaCm2, entry.proximidadeSensivel),
  };
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `ficha-${entry.id.toLowerCase()}.json`,
    "application/json;charset=utf-8;",
  );
}

export function exportOficioIP(entry: EntradaAnomalia): void {
  const gravidade = getGravidade(
    entry.coberturaPct,
    entry.areaEstimadaCm2,
    entry.proximidadeSensivel,
  );
  const oficio = {
    documento: "Ofício Técnico de Encaminhamento — Infraestruturas de Portugal (IP)",
    entidadeEmitente: "Câmara Municipal de Loulé · Divisão de Mobilidade e Infraestruturas Viárias",
    entidadeDestinataria: "Infraestruturas de Portugal, S.A. — Direção Regional do Algarve",
    referenciaInterna: `OF-IP-${entry.id}-${new Date().toISOString().slice(0, 10)}`,
    emitidoEm: new Date().toISOString(),
    enquadramento: {
      roadnumber: entry.roadnumber ?? "EN125",
      categoria: entry.categoria ?? "Estrada Nacional",
      nVias: entry.nVias ?? "2",
      gestao: entry.gestao ?? "Infraestruturas de Portugal (IP)",
      freguesia: entry.freguesia,
      local: entry.rua,
      slaMunicipalIsento: true,
    },
    localizacaoGps: {
      latitude: entry.lat,
      longitude: entry.lng,
      srid: 4326,
    },
    diagnosticoIA: {
      tipoAnomalia: entry.tipo,
      gravidade,
      confiancaYolo: entry.confianca,
      areaEstimadaCm2: entry.areaEstimadaCm2,
      mascaraSeveridadeBbox: entry.bbox,
    },
    evidenciaFotografica: {
      imagemUrl: entry.imagemUrl,
      viaturaOrigem: entry.viatura,
      dataDetecao: entry.ultimaDetecaoIso,
    },
    notas: entry.notas ?? null,
  };
  triggerDownload(
    JSON.stringify(oficio, null, 2),
    `oficio-ip-${(entry.roadnumber ?? "en125").toLowerCase()}-${entry.id.toLowerCase()}.json`,
    "application/json;charset=utf-8;",
  );
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
