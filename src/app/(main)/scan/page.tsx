'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera, CameraOff, CheckCircle2, XCircle,
  AlertTriangle, Zap, ArrowLeft, Vibrate,
  UserCheck, RotateCcw,
} from 'lucide-react';

type ScanState = 'idle' | 'scanning' | 'processing' | 'success' | 'error' | 'duplicate';

interface ScanResult {
  state: ScanState;
  message: string;
  attendeeName?: string;
  type?: string;
}

export default function QrScannerPage() {
  const router = useRouter();
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<any>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult>({ state: 'idle', message: '' });
  const [scanCount, setScanCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  // Haptic feedback (if available)
  const vibrate = useCallback((pattern: number[]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  // Parse QR payload to extract eventId
  // QR format: {type}:{id}:{eventId}:{userId}:{signature}
  const parseQrPayload = useCallback((qrText: string): { eventId: string; payload: string } | null => {
    const parts = qrText.split(':');
    if (parts.length !== 5) return null;

    const [type, , eventId, ,] = parts;
    if (type !== 'T' && type !== 'R') return null;

    // Basic UUID check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) return null;

    return { eventId, payload: qrText };
  }, []);

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
        setResult({ state: 'error', message: 'Invalid QR code format' });
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
        setResult({
          state: 'error',
          message: 'Not authorized — please log in',
        });
      } else if (res.status === 403) {
        setResult({
          state: 'error',
          message: 'Access denied — you need SCAN_QR privilege',
        });
      } else {
        vibrate([200, 100, 200]);
        setResult({
          state: 'error',
          message: data.error || 'Check-in failed',
        });
      }
    } catch {
      vibrate([200, 100, 200, 100, 200]);
      setResult({
        state: 'error',
        message: 'Network error — are you online?',
      });
    } finally {
      setIsProcessing(false);
      processingRef.current = false;
    }
  }, [parseQrPayload, vibrate]);

  // Initialize scanner
  useEffect(() => {
    let scanner: any = null;

    const initScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!scannerRef.current) return;

        scanner = new Html5Qrcode('qr-reader', { verbose: false });
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decodedText: string) => {
            processQr(decodedText);
          },
          () => {
            // Ignore scan failures (no QR found in frame)
          }
        );

        setCameraReady(true);
      } catch (err: any) {
        console.error('[Scanner] Init error:', err);
        if (err?.message?.includes('Permission')) {
          setCameraError('Camera access denied. Please allow camera access in your browser settings.');
        } else if (err?.message?.includes('NotFoundError') || err?.name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
        } else {
          setCameraError(err?.message || 'Failed to start camera');
        }
      }
    };

    initScanner();

    return () => {
      if (scanner) {
        scanner.stop().catch(() => {});
      }
    };
  }, [processQr]);

  // Auto-clear result after delay
  useEffect(() => {
    if (result.state === 'success' || result.state === 'duplicate' || result.state === 'error') {
      const timer = setTimeout(() => {
        setResult({ state: 'idle', message: '' });
      }, result.state === 'success' ? 3000 : 4000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const resetScanner = useCallback(() => {
    setResult({ state: 'idle', message: '' });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="safe-top bg-black/80 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-semibold">QR Scanner</h1>
          <div className="flex items-center gap-2">
            <div className="bg-white/10 px-3 py-1 rounded-full text-xs font-medium">
              <Zap size={12} className="inline mr-1 text-green-400" />
              {scanCount} scanned
            </div>
          </div>
        </div>
      </div>

      {/* Camera / Scanner area */}
      <div className="flex-1 relative flex items-center justify-center">
        {cameraError ? (
          <div className="text-center px-6">
            <CameraOff size={64} className="mx-auto mb-4 text-red-400" />
            <p className="text-sm text-gray-300 mb-4">{cameraError}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-white/10 px-4 py-2 rounded-lg text-sm flex items-center gap-2 mx-auto"
            >
              <RotateCcw size={16} /> Retry
            </button>
          </div>
        ) : (
          <>
            {/* Scanner container */}
            <div className="relative w-full max-w-sm mx-auto">
              <div
                id="qr-reader"
                ref={scannerRef}
                className="w-full overflow-hidden rounded-2xl"
                style={{ minHeight: 300 }}
              />

              {/* Scanner overlay - corner brackets */}
              {cameraReady && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-[250px] h-[250px]">
                    {/* top-left */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-brand-500 rounded-tl-lg" />
                    {/* top-right */}
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-brand-500 rounded-tr-lg" />
                    {/* bottom-left */}
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-brand-500 rounded-bl-lg" />
                    {/* bottom-right */}
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-brand-500 rounded-br-lg" />

                    {/* Scanning line animation */}
                    {!isProcessing && (
                      <div className="absolute left-2 right-2 h-0.5 bg-brand-500/80 animate-scan-line" />
                    )}
                  </div>
                </div>
              )}

              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="text-center">
                    <Camera size={48} className="mx-auto mb-3 text-gray-400 animate-pulse" />
                    <p className="text-sm text-gray-300">Starting camera...</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Result toast area */}
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
                onClick={resetScanner}
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
            Point camera at a ticket QR code to check in
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBanner({
  icon,
  message,
  detail,
  className,
  action,
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
