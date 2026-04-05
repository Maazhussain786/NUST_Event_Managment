'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Camera, CameraOff, CheckCircle2, XCircle,
  AlertTriangle, Zap, ArrowLeft,
  UserCheck, RotateCcw, Calendar, ShieldAlert, RefreshCw, Loader2,
} from 'lucide-react';

type ScanState = 'idle' | 'scanning' | 'processing' | 'success' | 'error' | 'duplicate';

interface ScanResult {
  state: ScanState;
  message: string;
  attendeeName?: string;
  type?: string;
}

interface CameraDevice {
  id: string;
  label: string;
}

const SCAN_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1,
  disableFlip: false,
};

function pickPreferredBackCamera(cameras: CameraDevice[]): CameraDevice | null {
  if (cameras.length === 0) return null;
  return (
    cameras.find((cam) => /(back|rear|environment)/i.test(cam.label)) ||
    cameras[cameras.length - 1]
  );
}

export default function EventQrScannerPage() {
  const { societyId, eventId } = useParams<{ societyId: string; eventId: string }>();
  const router = useRouter();
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<any>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult>({ state: 'idle', message: '' });
  const [scanCount, setScanCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const [eventTitle, setEventTitle] = useState<string>('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [activeFacingMode, setActiveFacingMode] =
    useState<'environment' | 'user'>('environment');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [scannerStarted, setScannerStarted] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  // Haptic feedback
  const vibrate = useCallback((pattern: number[]) => {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }, []);

  // Load event title
  useEffect(() => {
    fetch(`/api/events/${eventId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.title) setEventTitle(data.title);
        else if (data?.event?.title) setEventTitle(data.event.title);
      })
      .catch((err) => console.error('Failed to fetch event:', err));
  }, [eventId]);

  // Verify scanner permission (SCAN_QR privilege check)
  useEffect(() => {
    fetch(`/api/societies/${societyId}/governance/my-role`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.role) {
          setPermissionDenied(true);
          return;
        }
        // hierarchy_level >= 3 means Director+
        const level = Number(data.role.hierarchy_level);
        if (level < 3) {
          setPermissionDenied(true);
        }
      })
      .catch(() => setPermissionDenied(true));
  }, [societyId]);

  // Parse QR payload — enforce it matches this eventId
  const parseQrPayload = useCallback((qrText: string): { eventId: string; payload: string } | null => {
    const parts = qrText.split(':');
    if (parts.length !== 5) return null;

    const [type, , qrEventId, ,] = parts;
    if (type !== 'T' && type !== 'R') return null;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(qrEventId)) return null;

    // Enforce event scope — ticket must be for THIS event
    if (qrEventId !== eventId) return null;

    return { eventId: qrEventId, payload: qrText };
  }, [eventId]);

  // Process scanned QR code
  const processQr = useCallback(async (qrText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setResult({ state: 'processing', message: 'Verifying ticket...' });

    try {
      const parsed = parseQrPayload(qrText);
      if (!parsed) {
        vibrate([200, 100, 200]);
        // Check if it's a valid QR but wrong event
        const parts = qrText.split(':');
        if (parts.length === 5 && (parts[0] === 'T' || parts[0] === 'R')) {
          setResult({ state: 'error', message: 'This ticket is for a different event' });
        } else {
          setResult({ state: 'error', message: 'Invalid QR code format' });
        }
        return;
      }

      const res = await fetch(`/api/events/${parsed.eventId}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_payload: parsed.payload }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        vibrate([100]);
        setScanCount(c => c + 1);
        setResult({
          state: 'success',
          message: 'Check-in successful!',
          attendeeName: data.attendance?.attendeeName,
          type: data.attendance?.type,
        });
      } else if (res.status === 409) {
        vibrate([100, 50, 100]);
        setResult({
          state: 'duplicate',
          message: data.error || 'Already checked in',
        });
      } else if (res.status === 401) {
        setResult({ state: 'error', message: 'Not authorized — please log in' });
      } else if (res.status === 403) {
        setResult({ state: 'error', message: 'Access denied — you need SCAN_QR privilege' });
      } else {
        vibrate([200, 100, 200]);
        setResult({ state: 'error', message: data.error || 'Check-in failed' });
      }
    } catch {
      vibrate([200, 100, 200, 100, 200]);
      setResult({ state: 'error', message: 'Network error — are you online?' });
    } finally {
      setIsProcessing(false);
      processingRef.current = false;
    }
  }, [parseQrPayload, vibrate]);

  const setScannerError = useCallback((err: any) => {
    console.error('[Scanner] Init error:', err);
    if (typeof window !== 'undefined') {
      const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '::1';

      if (!window.isSecureContext && !isLocalhost) {
        setCameraError('Camera requires HTTPS on mobile browsers. Open this page on a secure https:// URL.');
        return;
      }
    }

    if (err?.message?.includes('Permission')) {
      setCameraError('Camera access denied. Please allow camera access in your browser settings.');
      return;
    }
    if (err?.name === 'NotAllowedError' || err?.message?.includes('NotAllowedError')) {
      setCameraError('Camera permission was blocked. Allow camera access and try again.');
      return;
    }
    if (err?.name === 'NotReadableError' || err?.message?.includes('NotReadableError')) {
      setCameraError('Camera is already in use by another app/tab. Close other camera apps and retry.');
      return;
    }
    if (err?.message?.includes('NotFoundError') || err?.name === 'NotFoundError') {
      setCameraError('No camera found on this device.');
      return;
    }
    setCameraError(err?.message || 'Failed to start camera');
  }, []);

  const requestCameraAccess = useCallback(async () => {
    if (typeof window === 'undefined') return false;

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '::1';

    if (!window.isSecureContext && !isLocalhost) {
      setCameraError('Camera requires HTTPS on mobile browsers. Open this page on a secure https:// URL.');
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('This browser does not support camera access. Use a modern mobile browser.');
      return false;
    }

    setIsRequestingPermission(true);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      stream.getTracks().forEach((track) => track.stop());
      setScannerStarted(true);
      return true;
    } catch (err) {
      setScannerError(err);
      return false;
    } finally {
      setIsRequestingPermission(false);
    }
  }, [setScannerError]);

  const startScanner = useCallback(
    async ({
      cameraId,
      facingMode = 'environment',
    }: {
      cameraId?: string | null;
      facingMode?: 'environment' | 'user';
    }): Promise<boolean> => {
      const scanner = html5QrRef.current;
      if (!scanner) return false;

      try {
        await scanner.start(
          cameraId ? { deviceId: { exact: cameraId } } : { facingMode },
          SCAN_CONFIG,
          (decodedText: string) => processQr(decodedText),
          () => {},
        );
        setCameraReady(true);
        setCameraError(null);
        setActiveCameraId(cameraId ?? null);
        setActiveFacingMode(facingMode);
        return true;
      } catch (err: any) {
        setCameraReady(false);
        setScannerError(err);
        return false;
      }
    },
    [processQr, setScannerError],
  );

  const stopScanner = useCallback(async () => {
    const scanner = html5QrRef.current;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // Scanner may already be stopped.
    }
  }, []);

  const handleFlipCamera = useCallback(async () => {
    if (isSwitchingCamera || isProcessing || !html5QrRef.current || !scannerStarted) return;

    setIsSwitchingCamera(true);
    setResult({ state: 'idle', message: '' });
    setCameraReady(false);
    setCameraError(null);

    const nextFacingMode = activeFacingMode === 'environment' ? 'user' : 'environment';

    try {
      await stopScanner();

      if (availableCameras.length > 1) {
        let nextCamera: CameraDevice | undefined;

        if (activeCameraId) {
          const idx = availableCameras.findIndex((cam) => cam.id === activeCameraId);
          if (idx >= 0) {
            nextCamera = availableCameras[(idx + 1) % availableCameras.length];
          }
        }

        if (!nextCamera) {
          const regex = nextFacingMode === 'environment'
            ? /(back|rear|environment)/i
            : /(front|user|face)/i;
          nextCamera = availableCameras.find((cam) => regex.test(cam.label)) || availableCameras[0];
        }

        await startScanner({ cameraId: nextCamera.id, facingMode: nextFacingMode });
      } else {
        await startScanner({ facingMode: nextFacingMode });
      }
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [
    activeCameraId,
    activeFacingMode,
    availableCameras,
    isProcessing,
    isSwitchingCamera,
    scannerStarted,
    startScanner,
    stopScanner,
  ]);

  // Initialize scanner
  useEffect(() => {
    if (permissionDenied || !scannerStarted) return;

    let cancelled = false;

    const initScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!scannerRef.current || cancelled) return;

        const scanner = new Html5Qrcode('qr-reader', { verbose: false });
        html5QrRef.current = scanner;

        let cameras: CameraDevice[] = [];
        try {
          const listed = await Html5Qrcode.getCameras();
          cameras = listed.map((cam: { id: string; label: string }) => ({
            id: cam.id,
            label: cam.label || `Camera ${cam.id}`,
          }));
        } catch {
          cameras = [];
        }

        if (cancelled) return;
        setAvailableCameras(cameras);

        const preferredBackCamera = pickPreferredBackCamera(cameras);
        const started = await startScanner(
          preferredBackCamera
            ? { cameraId: preferredBackCamera.id, facingMode: 'environment' }
            : { facingMode: 'environment' },
        );

        if (!started && cameras.length > 0) {
          await startScanner({ cameraId: cameras[0].id, facingMode: 'environment' });
        }
      } catch (err: any) {
        setScannerError(err);
      }
    };

    initScanner();

    return () => {
      cancelled = true;
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {});
        html5QrRef.current = null;
      }
    };
  }, [permissionDenied, scannerStarted, setScannerError, startScanner]);

  // Auto-clear result
  useEffect(() => {
    if (result.state === 'success' || result.state === 'duplicate' || result.state === 'error') {
      const timer = setTimeout(() => setResult({ state: 'idle', message: '' }),
        result.state === 'success' ? 3000 : 4000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  if (permissionDenied) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <ShieldAlert size={64} className="text-red-400 mb-4" />
        <h1 className="text-lg font-semibold mb-2">Access Denied</h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          You don&apos;t have permission to scan QR codes for this event.
          Only Presidents, VPs, Directors, and Deputies can use the scanner.
        </p>
        <button
          onClick={() => router.back()}
          className="bg-white/10 px-5 py-2.5 rounded-lg text-sm"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header with event name */}
      <div className="safe-top bg-black/80 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.push(`/society/${societyId}/events/${eventId}/entry`)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 text-center px-2">
            <h1 className="text-sm font-semibold truncate">
              {eventTitle || 'QR Scanner'}
            </h1>
            <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
              <Calendar size={10} /> Entry Scanner
            </p>
          </div>
          <div className="bg-white/10 px-3 py-1 rounded-full text-xs font-medium">
            <Zap size={12} className="inline mr-1 text-green-400" />
            {scanCount}
          </div>
        </div>
      </div>

      {/* Camera area */}
      <div className="flex-1 relative flex items-center justify-center">
        {cameraError ? (
          <div className="text-center px-6">
            <CameraOff size={64} className="mx-auto mb-4 text-red-400" />
            <p className="text-sm text-gray-300 mb-4">{cameraError}</p>
            <button
              onClick={() => {
                void requestCameraAccess();
              }}
              className="bg-white/10 px-4 py-2 rounded-lg text-sm flex items-center gap-2 mx-auto"
              disabled={isRequestingPermission}
            >
              {isRequestingPermission ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Requesting Access...
                </>
              ) : (
                <>
                  <RotateCcw size={16} /> Retry
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-sm mx-auto">
            <div
              id="qr-reader"
              ref={scannerRef}
              className="w-full overflow-hidden rounded-2xl"
              style={{ minHeight: 300 }}
            />

            {cameraReady && (
              <button
                onClick={handleFlipCamera}
                disabled={isSwitchingCamera || isProcessing}
                className="absolute top-3 right-3 z-20 rounded-lg bg-black/60 px-3 py-2 text-xs font-medium backdrop-blur flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSwitchingCamera ? 'animate-spin' : ''} />
                {isSwitchingCamera ? 'Switching...' : 'Flip Camera'}
              </button>
            )}

            {cameraReady && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-[250px] h-[250px]">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-brand-500 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-brand-500 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-brand-500 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-brand-500 rounded-br-lg" />
                  {!isProcessing && (
                    <div className="absolute left-2 right-2 h-0.5 bg-brand-500/80 animate-scan-line" />
                  )}
                </div>
              </div>
            )}

            {!scannerStarted && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <Camera size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-300 mb-3">Enable camera to start scanning</p>
                  <button
                    onClick={() => {
                      void requestCameraAccess();
                    }}
                    className="bg-brand-500 hover:bg-brand-600 px-4 py-2 rounded-lg text-sm font-medium"
                    disabled={isRequestingPermission}
                  >
                    {isRequestingPermission ? 'Requesting...' : 'Enable Camera'}
                  </button>
                </div>
              </div>
            )}

            {scannerStarted && !cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <Camera size={48} className="mx-auto mb-3 text-gray-400 animate-pulse" />
                  <p className="text-sm text-gray-300">Starting camera...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result area */}
      <div className="px-4 pb-6 pt-2 space-y-3">
        {result.state === 'processing' && (
          <ResultBanner
            icon={<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            message={result.message}
            className="bg-blue-600"
          />
        )}

        {result.state === 'success' && (
          <ResultBanner
            icon={<CheckCircle2 size={20} />}
            message={result.message}
            detail={result.attendeeName ? `${result.attendeeName} (${result.type})` : undefined}
            className="bg-green-600"
          />
        )}

        {result.state === 'duplicate' && (
          <ResultBanner
            icon={<AlertTriangle size={20} />}
            message={result.message}
            className="bg-amber-600"
          />
        )}

        {result.state === 'error' && (
          <ResultBanner
            icon={<XCircle size={20} />}
            message={result.message}
            className="bg-red-600"
            action={
              <button
                onClick={() => setResult({ state: 'idle', message: '' })}
                className="text-xs underline opacity-80 hover:opacity-100"
              >
                Dismiss
              </button>
            }
          />
        )}

        {result.state === 'idle' && cameraReady && (
          <div className="text-center text-gray-400 text-sm py-2">
            <UserCheck size={16} className="inline mr-1.5" />
            Point {activeFacingMode === 'environment' ? 'back' : 'front'} camera at a ticket QR code
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBanner({
  icon, message, detail, className, action,
}: {
  icon: React.ReactNode;
  message: string;
  detail?: string;
  className: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${className} rounded-xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-2`}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{message}</p>
        {detail && <p className="text-xs opacity-80 truncate">{detail}</p>}
      </div>
      {action}
    </div>
  );
}
