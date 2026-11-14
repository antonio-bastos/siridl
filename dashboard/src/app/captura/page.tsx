"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Camera,
  Gauge,
  PauseCircle,
  Play,
  Radio,
  Satellite,
  Square,
  Volume2,
  WifiOff,
} from "lucide-react";

import {
  enqueueOfflineFrame,
  flushOfflineQueue,
  getOfflineQueueCount,
} from "@/lib/offline-capture-queue";

interface StreamDetection {
  id: string;
  label: string;
  confidence: number;
  severity: "Baixa" | "Média" | "Crítica";
  area_pct: number;
  bbox: {
    norm_x1: number;
    norm_y1: number;
    norm_x2: number;
    norm_y2: number;
  };
}

interface TelemetryRefState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speedKmh: number;
  hasFix: boolean;
}

const DEVICE_ID = "s22u-fleet-01";
const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 720;
const JPEG_QUALITY = 0.8;
const MIN_SPEED_KMH = 3.0;
const HIGH_SPEED_KMH = 45.0;

function selectPrimaryRearCamera(devices: MediaDeviceInfo[]): MediaDeviceInfo | null {
  const videoInputs = devices.filter((d) => d.kind === "videoinput");
  if (videoInputs.length === 0) return null;

  const rearCandidates = videoInputs.filter((d) => {
    const label = d.label.toLowerCase();
    const isFront = label.includes("front") || label.includes("selfie") || label.includes("user");
    return !isFront;
  });

  const pool = rearCandidates.length > 0 ? rearCandidates : videoInputs;
  const primaryWide = pool.find((d) => {
    const label = d.label.toLowerCase();
    const isUltrawide =
      label.includes("ultra") ||
      label.includes("0.5") ||
      label.includes("0.6") ||
      label.includes("macro");
    const isTele =
      label.includes("tele") ||
      label.includes("periscope") ||
      label.includes("3x") ||
      label.includes("10x");
    return !isUltrawide && !isTele;
  });

  return primaryWide ?? pool[0] ?? null;
}

function playCriticalChime(audioCtxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.12);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch {
    // Ignore audio errors when autoplay policy blocks sound
  }
}

export default function CapturaAoVivoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const isAuditingRef = useRef(false);

  const telemetryRef = useRef<TelemetryRefState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    speedKmh: 0,
    hasFix: false,
  });

  const [isAuditing, setIsAuditing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lensLabel, setLensLabel] = useState("1x Principal • 30 FPS");
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // HUD display state updated at 1Hz / on change
  const [hudSpeedKmh, setHudSpeedKmh] = useState(0);
  const [hudAccuracyM, setHudAccuracyM] = useState<number | null>(null);
  const [hudHasFix, setHudHasFix] = useState(false);
  const [sessionDetections, setSessionDetections] = useState(0);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [lastCriticalAlert, setLastCriticalAlert] = useState<string | null>(null);

  const samplingFps =
    hudSpeedKmh <= MIN_SPEED_KMH ? 0 : hudSpeedKmh >= HIGH_SPEED_KMH ? 10 : 5;

  const drawOverlayBoxes = useCallback((detections: StreamDetection[]) => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = video.clientWidth || window.innerWidth;
    const height = video.clientHeight || window.innerHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    for (const det of detections) {
      const x1 = det.bbox.norm_x1 * width;
      const y1 = det.bbox.norm_y1 * height;
      const boxW = (det.bbox.norm_x2 - det.bbox.norm_x1) * width;
      const boxH = (det.bbox.norm_y2 - det.bbox.norm_y1) * height;

      const strokeColor =
        det.severity === "Crítica"
          ? "#ef4444"
          : det.severity === "Média"
            ? "#f59e0b"
            : "#10b981";

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, boxW, boxH);

      const tag = `${det.label} • ${(det.confidence * 100).toFixed(0)}% (${det.severity})`;
      ctx.font = "600 13px system-ui, sans-serif";
      const textWidth = ctx.measureText(tag).width;
      const labelY = Math.max(24, y1);
      ctx.fillStyle = strokeColor;
      ctx.fillRect(x1, labelY - 22, textWidth + 14, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(tag, x1 + 7, labelY - 7);
    }
  }, []);

  const sendFramePayload = useCallback(async (blob: Blob, telemetryJson: string) => {
    const formData = new FormData();
    formData.append("frame", blob, `frame_${Date.now()}.jpg`);
    formData.append("telemetry", telemetryJson);

    const response = await fetch("/api/stream/detect", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }, []);

  const flushPendingOffline = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const res = await flushOfflineQueue(async (blob, telemetryJson) => {
        try {
          await sendFramePayload(blob, telemetryJson);
          return true;
        } catch {
          return false;
        }
      });
      setOfflineCount(res.remaining);
    } catch {
      // ignore IndexedDB errors
    }
  }, [sendFramePayload]);

  // Monitor online/offline status & auto-flush IndexedDB queue
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    void getOfflineQueueCount().then(setOfflineCount);

    const handleOnline = () => {
      setIsOnline(true);
      void flushPendingOffline();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushPendingOffline]);

  // Initialize 1x rear camera + continuous focus
  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Este navegador não suporta acesso à câmara (navigator.mediaDevices).");
      return;
    }

    try {
      setCameraError(null);
      let devices = await navigator.mediaDevices.enumerateDevices();
      let preferred = selectPrimaryRearCamera(devices);

      const initialConstraints: MediaStreamConstraints = {
        audio: false,
        video: {
          ...(preferred?.deviceId
            ? { deviceId: { exact: preferred.deviceId } }
            : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      };

      let stream = await navigator.mediaDevices.getUserMedia(initialConstraints);

      // Re-enumerate after permission grant if labels were hidden
      if (!preferred?.label) {
        devices = await navigator.mediaDevices.enumerateDevices();
        const better = selectPrimaryRearCamera(devices);
        if (better?.deviceId && better.deviceId !== preferred?.deviceId) {
          stream.getTracks().forEach((t) => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              deviceId: { exact: better.deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 30 },
            },
          });
          preferred = better;
        }
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet],
          });
        } catch {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: "manual" } as unknown as MediaTrackConstraintSet],
            });
          } catch {
            // Focus constraints unsupported on this device
          }
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLensLabel("1x Principal • 30 FPS");
      setCameraReady(true);
    } catch {
      setCameraError(
        "Não foi possível aceder à câmara traseira. Verifique as permissões no Chrome.",
      );
      setCameraReady(false);
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
      }
    };
  }, [startCamera]);

  // 1 Hz high-accuracy Geolocation watchPosition
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const speedMs = pos.coords.speed;
        const speedKmh =
          typeof speedMs === "number" && Number.isFinite(speedMs) && speedMs >= 0
            ? Number((speedMs * 3.6).toFixed(1))
            : 0;

        telemetryRef.current = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
          speedKmh,
          hasFix: true,
        };

        setHudSpeedKmh(speedKmh);
        setHudAccuracyM(Math.round(pos.coords.accuracy));
        setHudHasFix(true);
      },
      () => {
        setHudHasFix(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Screen Wake Lock management while auditing
  const acquireWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener("release", () => {
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isAuditingRef.current) {
        void acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [acquireWakeLock]);

  // Speed-Adaptive Frame Capture Loop (paused <= 3 km/h, 5 FPS < 45 km/h, 10 FPS >= 45 km/h)
  const scheduleNextCapture = useCallback(() => {
    if (!isAuditingRef.current) return;

    const current = telemetryRef.current;
    if (current.speedKmh <= MIN_SPEED_KMH) {
      drawOverlayBoxes([]);
      loopTimerRef.current = window.setTimeout(scheduleNextCapture, 250);
      return;
    }

    const activeFps = current.speedKmh >= HIGH_SPEED_KMH ? 10 : 5;
    const intervalMs = activeFps === 10 ? 100 : 200;

    const video = videoRef.current;
    if (video && video.readyState >= 2 && !inFlightRef.current) {
      inFlightRef.current = true;
      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement("canvas");
      }
      const canvas = offscreenCanvasRef.current;
      canvas.width = CAPTURE_WIDTH;
      canvas.height = CAPTURE_HEIGHT;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
        canvas.toBlob(
          async (blob) => {
            try {
              if (!blob) return;
              const telemetryJson = JSON.stringify({
                device_id: DEVICE_ID,
                timestamp: new Date().toISOString(),
                latitude: current.latitude ?? 37.07124,
                longitude: current.longitude ?? -8.10452,
                speed_kmh: current.speedKmh,
                gps_accuracy_m: current.accuracy ?? 10,
                sampling_fps: activeFps,
              });

              if (!navigator.onLine) {
                await enqueueOfflineFrame({
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  blob,
                  telemetryJson,
                  createdAt: Date.now(),
                });
                setOfflineCount(await getOfflineQueueCount());
                return;
              }

              const result = await sendFramePayload(blob, telemetryJson);
              const detections: StreamDetection[] = Array.isArray(result?.detections)
                ? result.detections
                : [];
              drawOverlayBoxes(detections);

              if (detections.length > 0) {
                setSessionDetections((prev) => prev + detections.length);
                const hasCritical = detections.some((d) => d.severity === "Crítica");
                if (hasCritical) {
                  playCriticalChime(audioCtxRef);
                  setLastCriticalAlert("Anomalia Crítica detetada!");
                  window.setTimeout(() => setLastCriticalAlert(null), 2500);
                }
              }
            } catch {
              if (blob) {
                const fallbackTelemetry = JSON.stringify({
                  device_id: DEVICE_ID,
                  timestamp: new Date().toISOString(),
                  latitude: current.latitude ?? 37.07124,
                  longitude: current.longitude ?? -8.10452,
                  speed_kmh: current.speedKmh,
                  gps_accuracy_m: current.accuracy ?? 10,
                  sampling_fps: activeFps,
                });
                await enqueueOfflineFrame({
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  blob,
                  telemetryJson: fallbackTelemetry,
                  createdAt: Date.now(),
                });
                setOfflineCount(await getOfflineQueueCount());
              }
            } finally {
              inFlightRef.current = false;
            }
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      } else {
        inFlightRef.current = false;
      }
    }

    loopTimerRef.current = window.setTimeout(scheduleNextCapture, intervalMs);
  }, [drawOverlayBoxes, sendFramePayload]);

  const toggleAudit = async () => {
    if (isAuditing) {
      isAuditingRef.current = false;
      setIsAuditing(false);
      if (loopTimerRef.current !== null) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      drawOverlayBoxes([]);
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      return;
    }

    isAuditingRef.current = true;
    setIsAuditing(true);
    await acquireWakeLock();
    scheduleNextCapture();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-slate-950 text-white select-none">
      {/* Full-Screen Camera Video Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Live Bounding Box Overlay Canvas */}
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Camera Fallback / Error Banner */}
      {cameraError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-950/90 px-6 text-center">
          <Camera className="h-12 w-12 text-amber-400" />
          <p className="max-w-md text-base font-medium text-slate-100">{cameraError}</p>
          <button
            type="button"
            onClick={() => void startCamera()}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* TOP HUD BAR */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-slate-950/90 via-slate-950/60 to-transparent px-4 pt-4 pb-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* GPS Lock Pill */}
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold backdrop-blur-md ${
              hudHasFix
                ? "border-emerald-400/50 bg-emerald-950/80 text-emerald-300"
                : "border-amber-400/50 bg-amber-950/80 text-amber-300"
            }`}
          >
            <Satellite className="h-4 w-4" />
            <span>
              {hudHasFix && hudAccuracyM !== null
                ? `GPS ±${hudAccuracyM}m`
                : "GPS a sincronizar..."}
            </span>
          </div>

          {/* Speed Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/85 px-3.5 py-1.5 text-sm font-bold tabular-nums text-white backdrop-blur-md">
            <Gauge className="h-4 w-4 text-sky-400" />
            <span>{Math.round(hudSpeedKmh)} km/h</span>
          </div>

          {/* Speed-Adaptive Sampling Badge */}
          {isAuditing && hudSpeedKmh <= MIN_SPEED_KMH ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/20 px-3.5 py-1.5 text-sm font-semibold text-amber-200 backdrop-blur-md">
              <PauseCircle className="h-4 w-4" />
              <span>Em Pausa (&lt; 3 km/h)</span>
            </div>
          ) : (
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold backdrop-blur-md ${
                isAuditing
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                  : "border-white/15 bg-slate-900/80 text-slate-300"
              }`}
            >
              <Radio className={`h-4 w-4 ${isAuditing ? "animate-pulse text-emerald-400" : ""}`} />
              <span>
                {isAuditing ? `${samplingFps} FPS Ativo` : "Pronto (5–10 FPS)"}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Lens Indicator */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/85 px-3.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-md sm:text-sm">
            <Camera className="h-4 w-4 text-emerald-400" />
            <span>{lensLabel}</span>
            {wakeLockActive && (
              <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                ECRÃ ATIVO
              </span>
            )}
          </div>

          {/* Offline IndexedDB Queue Pill */}
          {(!isOnline || offlineCount > 0) && (
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/60 bg-rose-950/85 px-3.5 py-1.5 text-xs font-semibold text-rose-200 backdrop-blur-md sm:text-sm">
              <WifiOff className="h-4 w-4" />
              <span>
                Offline • {offlineCount} {offlineCount === 1 ? "fotograma" : "fotogramas"} em fila
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Center Critical Alert Toast */}
      {lastCriticalAlert && (
        <div className="pointer-events-none relative z-20 mx-auto flex items-center gap-2 rounded-full border border-red-400 bg-red-600/90 px-5 py-2 text-sm font-bold text-white shadow-lg">
          <Volume2 className="h-4 w-4" />
          <span>{lastCriticalAlert}</span>
        </div>
      )}

      {/* BOTTOM HUD BAR */}
      <footer className="relative z-20 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-t from-slate-950/95 via-slate-950/75 to-transparent px-4 pt-8 pb-5 sm:px-6">
        <Link
          href="/entradas"
          className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar a Entradas
        </Link>

        <button
          type="button"
          onClick={() => void toggleAudit()}
          disabled={!cameraReady && !isAuditing}
          className={`inline-flex min-w-[220px] items-center justify-center gap-2.5 rounded-2xl px-7 py-4 text-base font-bold shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 ${
            isAuditing
              ? "bg-rose-600 text-white hover:bg-rose-500"
              : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          }`}
        >
          {isAuditing ? (
            <>
              <Square className="h-5 w-5 fill-current" />
              Parar Auditoria
            </>
          ) : (
            <>
              <Play className="h-5 w-5 fill-current" />
              Iniciar Auditoria
            </>
          )}
        </button>

        <div className="inline-flex items-center gap-2.5 rounded-2xl border border-white/20 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white backdrop-blur-md">
          <Activity className="h-4 w-4 text-emerald-400" />
          <span>
            Deteções na sessão:{" "}
            <strong className="font-mono text-base text-emerald-300">
              {sessionDetections}
            </strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
