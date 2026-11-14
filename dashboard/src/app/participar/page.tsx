"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  FileVideo,
  Info,
  Loader2,
  MapPin,
  Navigation,
  Route,
  Sparkles,
  UploadCloud,
  Video,
  XCircle,
} from "lucide-react";

import { PinDropperMap } from "@/components/participar/pin-dropper-map";
import { extractExifGpsFromFile } from "@/lib/exif-gps";
import { compressImageAspectFit } from "@/lib/image-resize";

type PortalTab = "photo" | "video";

interface NearbySensitivePoi {
  name: string;
  label_pt: string;
  zone_type: string;
  distance_m: number;
}

interface PhotoValidationResponse {
  status: "accepted" | "rejected_by_ai" | "rejected_by_quality_gate";
  reason?: string | null;
  message: string;
  anomaly_id?: string;
  anomaly_type?: string;
  confidence?: number;
  max_confidence?: number;
  estimated_area_cm2?: number;
  sharpness_score?: number;
  base_severity?: "Baixa" | "Média" | "Crítica";
  severity?: "Baixa" | "Média" | "Crítica";
  proximity_boost?: boolean;
  nearby_poi?: NearbySensitivePoi | null;
  street_name?: string;
  parish?: string;
  road_class?: string;
  snapped?: boolean;
  snap_distance_m?: number;
  deduplicated?: boolean;
  times_detected?: number;
  lat?: number;
  lng?: number;
  mode?: string;
}

interface VideoJobResponse {
  status: string;
  job_id: string;
  message: string;
  has_gpx?: boolean;
  mode?: string;
}

const LOULE_DEFAULT_COORDS = {
  lat: 37.1364,
  lng: -8.0205,
};

const CATEGORIES = [
  { value: "auto", label: "Deixar a IA Detetar (Recomendado)" },
  { value: "buraco", label: "Buraco no Pavimento" },
  { value: "fissura", label: "Fissura Longitudinal" },
  { value: "tampa", label: "Tampa de Esgoto Desnivelada" },
  { value: "sinalizacao", label: "Sinalização Danificada" },
];

export default function ParticiparPage() {
  const [activeTab, setActiveTab] = useState<PortalTab>("photo");

  // Tab 1: Photo + GPS state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState(LOULE_DEFAULT_COORDS);
  const [gpsSource, setGpsSource] = useState<"default" | "exif" | "browser" | "manual">("default");
  const [locatingGps, setLocatingGps] = useState(false);
  const [category, setCategory] = useState("auto");
  const [description, setDescription] = useState("");
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [photoStage, setPhotoStage] = useState<"idle" | "validating" | "done">("idle");
  const [photoResult, setPhotoResult] = useState<PhotoValidationResponse | null>(null);

  // Tab 2: Video + GPX state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [videoResult, setVideoResult] = useState<VideoJobResponse | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const requestBrowserGeolocation = useCallback((silent = false) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (!silent) {
        toast.error("O seu navegador não suporta geolocalização.");
      }
      return;
    }

    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
        setGpsSource("browser");
        setLocatingGps(false);
        if (!silent) {
          toast.success("Localização GPS obtida com precisão.");
        }
      },
      () => {
        setLocatingGps(false);
        if (!silent) {
          toast.info(
            "Não foi possível obter o GPS automático. Ajuste o pino diretamente no mapa.",
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  const handlePhotoSelected = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Por favor selecione uma imagem válida (JPG, PNG ou WebP).");
        return;
      }

      // Extract EXIF GPS from the original file before canvas compression strips metadata
      const exifCoords = await extractExifGpsFromFile(file);
      const optimizedFile = await compressImageAspectFit(file, 1280, 0.85);

      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
      setPhotoFile(optimizedFile);
      setPhotoPreviewUrl(URL.createObjectURL(optimizedFile));
      setPhotoResult(null);
      setPhotoStage("idle");

      if (exifCoords) {
        setCoords(exifCoords);
        setGpsSource("exif");
        toast.success("Coordenadas GPS extraídas automaticamente dos dados EXIF da foto.");
      } else {
        requestBrowserGeolocation(true);
      }
    },
    [photoPreviewUrl, requestBrowserGeolocation],
  );

  const handleSubmitPhoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!photoFile) {
      toast.error("Adicione ou capture uma fotografia da anomalia primeiro.");
      return;
    }

    setPhotoStage("validating");
    setPhotoResult(null);

    try {
      const formData = new FormData();
      formData.append("image", photoFile);
      formData.append("lat", String(coords.lat));
      formData.append("lng", String(coords.lng));
      formData.append("category", category);
      if (description.trim()) {
        formData.append("description", description.trim());
      }

      const response = await fetch("/api/citizen/report-photo", {
        method: "POST",
        body: formData,
      });

      const payload: PhotoValidationResponse = await response.json();
      setPhotoResult(payload);
      setPhotoStage("done");

      if (payload.status === "accepted") {
        if (typeof payload.lat === "number" && typeof payload.lng === "number") {
          setCoords({ lat: payload.lat, lng: payload.lng });
        }
        toast.success("Participação registada e validada pela IA!");
      } else {
        toast.warning("A IA não confirmou anomalia viária nesta imagem.");
      }
    } catch {
      setPhotoStage("idle");
      toast.error("Ocorreu um erro ao comunicar com o servidor de validação.");
    }
  };

  const handleSubmitVideo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!videoFile) {
      toast.error("Selecione um ficheiro de vídeo (.mp4) para enviar.");
      return;
    }

    setSubmittingVideo(true);
    setVideoResult(null);

    try {
      const formData = new FormData();
      formData.append("video", videoFile);
      if (gpxFile) {
        formData.append("gpx_file", gpxFile);
      }

      const response = await fetch("/api/citizen/process-video", {
        method: "POST",
        body: formData,
      });
      const payload: VideoJobResponse = await response.json();
      setVideoResult(payload);
      toast.success("Percurso enviado para análise assíncrona com YOLOv11 + ByteTrack!");
    } catch {
      toast.error("Erro ao enviar o vídeo do percurso.");
    } finally {
      setSubmittingVideo(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-slate-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100/70 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" />
            Portal do Cidadão • Município de Loulé
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Eu Participo
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Reporte anomalias na via pública com validação automática por visão computacional
            (YOLOv11) ou submeta gravações de percurso com telemetria GPS.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-600 shadow-xs sm:self-center">
          <Compass className="h-4 w-4 text-emerald-600" />
          <div>
            <div className="font-semibold text-slate-800">Privacidade RGPD</div>
            <div>Rostos e matrículas desfocados automaticamente</div>
          </div>
        </div>
      </header>

      {/* Two-Tab Navigation */}
      <div
        role="tablist"
        aria-label="Modo de participação"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5 sm:grid-cols-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "photo"}
          onClick={() => setActiveTab("photo")}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            activeTab === "photo"
              ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Camera className="h-4 w-4" />
          Reporte Rápido (Foto + GPS)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "video"}
          onClick={() => setActiveTab("video")}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            activeTab === "video"
              ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Route className="h-4 w-4" />
          Gravação de Percurso (Vídeo MP4 + GPX)
        </button>
      </div>

      {/* TAB 1: REPORTE RÁPIDO */}
      {activeTab === "photo" ? (
        <form onSubmit={handleSubmitPhoto} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left column: Photo Upload & Form fields */}
          <div className="flex flex-col gap-5 lg:col-span-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Camera className="h-4 w-4 text-emerald-600" />
                1. Fotografia da Anomalia
              </h2>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(true);
                }}
                onDragLeave={() => setIsDraggingPhoto(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(false);
                  const dropped = e.dataTransfer.files?.[0] ?? null;
                  void handlePhotoSelected(dropped);
                }}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                  isDraggingPhoto
                    ? "border-emerald-500 bg-emerald-50/70"
                    : "border-slate-300 bg-slate-50/60 hover:border-emerald-400"
                }`}
              >
                {photoPreviewUrl ? (
                  <div className="w-full space-y-3">
                    <img
                      src={photoPreviewUrl}
                      alt="Pré-visualização da anomalia reportada"
                      className="h-52 w-full rounded-lg object-cover shadow-xs"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span className="truncate font-medium text-slate-800">
                        {photoFile?.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="font-semibold text-emerald-700 hover:underline"
                      >
                        Trocar fotografia
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 py-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Arraste uma fotografia para aqui ou use a câmara
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        As coordenadas GPS EXIF são lidas automaticamente se estiverem ativas na câmara.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Tirar Foto (Câmara)
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Escolher Ficheiro
                      </button>
                    </div>
                  </div>
                )}

                {/* Mobile rear camera capture input */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void handlePhotoSelected(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handlePhotoSelected(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="citizen-category"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    Tipo de Anomalia (Opcional)
                  </label>
                  <select
                    id="citizen-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {CATEGORIES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="citizen-description"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    Observações / Ponto de Referência (Opcional)
                  </label>
                  <textarea
                    id="citizen-description"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex.: Junto à passadeira em frente ao nº 42, sentido Quarteira..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Right column: GPS Pin-dropper & AI Validation Feedback */}
          <div className="flex flex-col gap-5 lg:col-span-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  2. Localização Exata na Via
                </h2>
                <button
                  type="button"
                  onClick={() => requestBrowserGeolocation(false)}
                  disabled={locatingGps}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {locatingGps ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Navigation className="h-3.5 w-3.5" />
                  )}
                  Usar GPS Atual
                </button>
              </div>

              <PinDropperMap
                lat={coords.lat}
                lng={coords.lng}
                onChange={(lat, lng) => {
                  setCoords({ lat, lng });
                  setGpsSource("manual");
                }}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-mono font-medium text-slate-800">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                  {gpsSource === "exif" && "Origem: EXIF da Fotografia"}
                  {gpsSource === "browser" && "Origem: GPS do Dispositivo"}
                  {gpsSource === "manual" && "Origem: Pino Ajustado no Mapa"}
                  {gpsSource === "default" && "Centro de Loulé (ajuste o pino)"}
                </span>
              </div>
            </section>

            {/* Submit & Real-Time AI Validation Feedback */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <button
                type="submit"
                disabled={photoStage === "validating"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {photoStage === "validating" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A validar imagem com YOLOv11...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Submeter e Validar com IA
                  </>
                )}
              </button>

              {photoStage === "validating" && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-800">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
                  <div>
                    <p className="font-semibold">A validar imagem com YOLOv11...</p>
                    <p className="text-emerald-700">
                      A verificar defeitos no pavimento, calcular severidade e aplicar anonimização RGPD.
                    </p>
                  </div>
                </div>
              )}

              {photoResult && photoResult.status === "accepted" && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{photoResult.message}</span>
                        {photoResult.anomaly_id && (
                          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                            #{photoResult.anomaly_id}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-emerald-800">
                        <span>Estado: Pendente de revisão municipal</span>
                        {typeof photoResult.estimated_area_cm2 === "number" && (
                          <span className="rounded-md bg-white px-2 py-0.5 font-mono font-semibold text-slate-800 ring-1 ring-emerald-200">
                            Área estimada (Homografia): ~{Math.round(photoResult.estimated_area_cm2)} cm²
                          </span>
                        )}
                        {typeof photoResult.sharpness_score === "number" && (
                          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-slate-700 ring-1 ring-emerald-200">
                            Nitidez: {photoResult.sharpness_score.toFixed(0)}
                          </span>
                        )}
                        {photoResult.street_name && (
                          <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-emerald-900 ring-1 ring-emerald-200">
                            {photoResult.street_name}
                            {photoResult.road_class ? ` • ${photoResult.road_class}` : ""}
                            {photoResult.snapped && typeof photoResult.snap_distance_m === "number"
                              ? ` (alinhado ${photoResult.snap_distance_m}m ao eixo OSM)`
                              : ""}
                          </span>
                        )}
                        {photoResult.deduplicated && (
                          <span>
                            • Agrupado a ocorrência existente ({photoResult.times_detected}x reportada)
                          </span>
                        )}
                      </div>
                      {photoResult.proximity_boost && photoResult.nearby_poi && (
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100/90 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                          <span>
                            Prioridade agravada (+1 nível): a {photoResult.nearby_poi.distance_m}m de{" "}
                            {photoResult.nearby_poi.label_pt} ({photoResult.nearby_poi.name})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {photoResult &&
                (photoResult.status === "rejected_by_ai" ||
                  photoResult.status === "rejected_by_quality_gate") && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-2.5">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {photoResult.status === "rejected_by_quality_gate"
                          ? "Fotografia descartada pelo controlo de qualidade ótica"
                          : "Nenhuma anomalia confirmada pela IA"}
                      </p>
                      <p className="text-xs leading-relaxed text-amber-800">
                        {photoResult.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </form>
      ) : (
        /* TAB 2: GRAVAÇÃO DE PERCURSO (VÍDEO MP4 + GPX) */
        <div className="flex flex-col gap-6">
          {/* Collapsible Recording Guide */}
          <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xs">
            <button
              type="button"
              onClick={() => setGuideOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 bg-emerald-50/70 px-5 py-4 text-left transition-colors hover:bg-emerald-50"
            >
              <div className="flex items-center gap-2.5">
                <Info className="h-5 w-5 text-emerald-700" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Guia de Gravação Otimizada (ex: Samsung S22 Ultra)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Recomendações técnicas para máxima precisão do modelo YOLOv11 em movimento
                  </p>
                </div>
              </div>
              {guideOpen ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>

            {guideOpen && (
              <div className="grid grid-cols-1 gap-4 border-t border-emerald-100 p-5 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                    1. Lente Principal 1x
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700">
                    Utilize sempre a <strong>Lente Principal 1x</strong>. Evite a grande-angular{" "}
                    <code>0.6x</code>, pois provoca distorção de barril que deforma fissuras e
                    buracos nas margens do fotograma.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                    2. Resolução 1080p @ 30 FPS
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700">
                    Grave a <strong>1080p @ 30 FPS</strong>. Reduz o tamanho do ficheiro para envio
                    rápido mantendo detalhe nítido do asfalto para amostragem a 6 FPS.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                    3. Modo Vídeo Pro (1/250s – 1/500s)
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700">
                    Bloqueie o <strong>Foco e Exposição (AF/AE Lock)</strong> no pavimento e defina
                    a velocidade do obturador para <strong>1/250s – 1/500s</strong> para eliminar{" "}
                    <em>motion blur</em> do asfalto a 50 km/h.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Video + GPX Upload Form */}
          <form
            onSubmit={handleSubmitVideo}
            className="grid grid-cols-1 gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs md:grid-cols-2"
          >
            <div className="space-y-2">
              <label
                htmlFor="video-upload"
                className="block text-sm font-semibold text-slate-900"
              >
                Vídeo Dashcam (.mp4) *
              </label>
              <label
                htmlFor="video-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center transition-colors hover:border-emerald-400"
              >
                <FileVideo className="mb-2 h-8 w-8 text-emerald-600" />
                <span className="text-sm font-medium text-slate-800">
                  {videoFile ? videoFile.name : "Selecionar vídeo .mp4"}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  {videoFile
                    ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB`
                    : "Amostragem automática a 6 FPS com rastreio ByteTrack"}
                </span>
                <input
                  id="video-upload"
                  type="file"
                  accept="video/mp4,video/quicktime,.mp4,.mov"
                  className="hidden"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="gpx-upload"
                className="block text-sm font-semibold text-slate-900"
              >
                Telemetria GPS (.gpx) — Opcional
              </label>
              <label
                htmlFor="gpx-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center transition-colors hover:border-emerald-400"
              >
                <Route className="mb-2 h-8 w-8 text-emerald-600" />
                <span className="text-sm font-medium text-slate-800">
                  {gpxFile ? gpxFile.name : "Selecionar ficheiro .gpx"}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  Sincroniza timestamps do vídeo e ignora paragens (&lt; 3 km/h)
                </span>
                <input
                  id="gpx-upload"
                  type="file"
                  accept=".gpx,application/gpx+xml"
                  className="hidden"
                  onChange={(e) => setGpxFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 md:col-span-2">
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  O processamento decorre em segundo plano: os fotogramas parados em semáforos
                  (&lt; 3 km/h) são ignorados e as deteções repetidas são agrupadas via ByteTrack.
                </span>
              </div>

              <button
                type="submit"
                disabled={submittingVideo}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {submittingVideo ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A enviar percurso...
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4" />
                    Enviar Vídeo para Auditoria Viária
                  </>
                )}
              </button>

              {videoResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        <span>Percurso em processamento</span>
                        <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs text-emerald-800 ring-1 ring-emerald-200">
                          Job #{videoResult.job_id}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800">{videoResult.message}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
