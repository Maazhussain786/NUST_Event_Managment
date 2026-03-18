'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, MapPin, Clock, Download, Loader2, AlertTriangle, XCircle, WifiOff } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { cacheTicket, getCachedTicket, type CachedTicket } from '@/lib/ticket-cache';
import { StatusTimeline, StatusBadge } from '@/components/StatusTimeline';
import { Button } from '@/components/ui/button';

interface TicketDetail {
  id: string;
  ticket_number: string;
  status: string;
  purchased_at: string;
  event_title: string;
  event_venue: string;
  event_start: string;
  event_end: string;
  event_banner: string | null;
  society_name: string;
  attendee_name: string;
  qr_data: string | null;
  is_paid: boolean;
  is_cancelled: boolean;
  source_type: 'ticket' | 'registration';
  scanned_at: string | null;
  rejection_reason?: string;
}

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function fetchTicket() {
      try {
        const res = await fetch(`/api/tickets/${params.id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Ticket not found');
        }
        const data = await res.json();
        setTicket(data.ticket);

        // Generate QR code image if qr_data exists
        let qrUrl: string | null = null;
        if (data.ticket.qr_data) {
          qrUrl = await QRCode.toDataURL(data.ticket.qr_data, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          });
          setQrImageUrl(qrUrl);
        }

        // Cache ticket for offline access (only approved tickets with QR)
        if (data.ticket.status === 'APPROVED' && data.ticket.qr_data) {
          cacheTicket({
            id: data.ticket.id,
            event_id: data.ticket.event_id || '',
            event_title: data.ticket.event_title,
            event_date: data.ticket.event_start,
            event_venue: data.ticket.event_venue || '',
            event_banner_url: data.ticket.event_banner || undefined,
            society_name: data.ticket.society_name,
            ticket_number: data.ticket.ticket_number,
            status: data.ticket.status,
            qr_data: data.ticket.qr_data,
            qr_image_data_url: qrUrl || undefined,
            attendee_name: data.ticket.attendee_name,
            attendee_email: '',
            cached_at: Date.now(),
          }).catch((err) => console.error('Failed to cache ticket:', err));
        }
      } catch (err) {
        // Try offline cache as fallback
        if (!navigator.onLine) {
          try {
            const cached = await getCachedTicket(params.id as string);
            if (cached) {
              setTicket({
                id: cached.id,
                ticket_number: cached.ticket_number,
                status: cached.status,
                purchased_at: '',
                event_title: cached.event_title,
                event_venue: cached.event_venue,
                event_start: cached.event_date,
                event_end: cached.event_date,
                event_banner: cached.event_banner_url || null,
                society_name: cached.society_name,
                attendee_name: cached.attendee_name,
                qr_data: cached.qr_data,
                is_paid: false,
                is_cancelled: false,
                source_type: 'ticket',
                scanned_at: null,
              });
              if (cached.qr_image_data_url) {
                setQrImageUrl(cached.qr_image_data_url);
              } else if (cached.qr_data) {
                const url = await QRCode.toDataURL(cached.qr_data, {
                  width: 300, margin: 2,
                  color: { dark: '#000000', light: '#ffffff' },
                  errorCorrectionLevel: 'M',
                });
                setQrImageUrl(url);
              }
              setLoading(false);
              return;
            }
          } catch (cacheErr) {
            console.error('Failed to load cached ticket:', cacheErr);
          }
        }
        setError(err instanceof Error ? err.message : 'Failed to load ticket');
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchTicket();
  }, [params.id]);

  const handleDownload = useCallback(async () => {
    if (!ticket || !qrImageUrl) return;
    setDownloading(true);

    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = 600, H = 900;
      canvas.width = W;
      canvas.height = H;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Header band
      const grad = ctx.createLinearGradient(0, 0, W, 160);
      grad.addColorStop(0, '#6366f1');
      grad.addColorStop(1, '#4f46e5');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, 160);

      // Event title on header
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(truncate(ticket.event_title, 35), 30, 80);
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(ticket.society_name, 30, 115);

      // Dashed tear line
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(30, 180);
      ctx.lineTo(W - 30, 180);
      ctx.stroke();
      ctx.setLineDash([]);

      // Details
      ctx.fillStyle = '#374151';
      ctx.font = '13px system-ui, sans-serif';
      const dateStr = new Date(ticket.event_start).toLocaleDateString('en-PK', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
      const timeStr = new Date(ticket.event_start).toLocaleTimeString('en-PK', {
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      const details = [
        ['Date', dateStr],
        ['Time', timeStr],
        ['Venue', ticket.event_venue || 'TBD'],
        ['Ticket #', ticket.ticket_number || 'N/A'],
      ];

      let y = 220;
      for (const [label, value] of details) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(label, 30, y);
        ctx.fillStyle = '#111827';
        ctx.font = '15px system-ui, sans-serif';
        ctx.fillText(truncate(value, 50), 30, y + 20);
        y += 50;
      }

      // QR Code
      const qrImg = new Image();
      qrImg.src = qrImageUrl;
      await new Promise<void>((resolve) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => resolve();
      });

      const qrSize = 240;
      const qrX = (W - qrSize) / 2;
      const qrY = y + 20;

      // QR background
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Instruction
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Show this QR code at the venue entrance', W / 2, qrY + qrSize + 40);

      // Attendee
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('Attendee', W / 2, qrY + qrSize + 70);
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = '#111827';
      ctx.fillText(ticket.attendee_name, W / 2, qrY + qrSize + 92);
      ctx.textAlign = 'start';

      // Watermark
      ctx.fillStyle = '#d1d5db';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NUST Events Platform', W / 2, H - 20);
      ctx.textAlign = 'start';

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ticket-${ticket.ticket_number || ticket.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (downloadErr) {
      console.error('Failed to download ticket:', downloadErr);
    } finally {
      setDownloading(false);
    }
  }, [ticket, qrImageUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-h2 text-foreground mb-1">Ticket Not Found</h2>
        <p className="text-muted-foreground text-body-sm mb-6">{error || 'This ticket could not be loaded.'}</p>
        <Button onClick={() => router.push('/tickets')}>
          Back to Tickets
        </Button>
      </div>
    );
  }

  const isCancelled = ticket.is_cancelled || ticket.status === 'CANCELLED' || ticket.status === 'REJECTED';
  const isPending = ticket.status === 'PENDING';
  const isApproved = ticket.status === 'APPROVED';
  const isScanned = !!ticket.scanned_at;
  const effectiveStatus = isScanned ? 'CHECKED_IN' : ticket.status;

  return (
    <div className="min-h-screen bg-background">
      {/* Hidden canvas for download */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="sticky top-0 z-header bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="px-5 pt-14 pb-4 safe-top flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="-ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-h2 text-foreground">E-Ticket</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Status Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatusTimeline status={effectiveStatus} />
        </motion.div>

        {/* Status Badge with description */}
        <StatusBadge
          status={effectiveStatus}
          reason={ticket.status === 'REJECTED' ? ticket.rejection_reason : undefined}
        />

        {/* Ticket Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={`rounded-2xl overflow-hidden border border-border bg-card ${isCancelled ? 'opacity-60' : ''}`}
        >
          {/* Top Section - Event Banner */}
          <div className="h-40 bg-gradient-to-br from-brand-500 to-brand-700 relative overflow-hidden">
            {ticket.event_banner && (
              <img src={ticket.event_banner} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute bottom-4 left-4 right-4">
              <h2 className="text-xl font-bold text-white line-clamp-2">
                {ticket.event_title}
              </h2>
              <p className="text-white/80 text-sm">
                {ticket.society_name}
              </p>
            </div>
          </div>

          {/* Tear Line */}
          <div className="relative">
            <div className="absolute left-0 -top-3 w-6 h-6 rounded-full bg-background" />
            <div className="absolute right-0 -top-3 w-6 h-6 rounded-full bg-background" />
            <div className="mx-8 border-t-2 border-dashed border-border" />
          </div>

          {/* Details Section */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-caption text-muted-foreground mb-1">Date</p>
                <div className="flex items-center gap-1.5 text-body-sm text-foreground">
                  <Calendar className="w-4 h-4 text-brand-500" />
                  {new Date(ticket.event_start).toLocaleDateString('en-PK', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </div>
              </div>
              <div>
                <p className="text-caption text-muted-foreground mb-1">Time</p>
                <div className="flex items-center gap-1.5 text-body-sm text-foreground">
                  <Clock className="w-4 h-4 text-brand-500" />
                  {new Date(ticket.event_start).toLocaleTimeString('en-PK', {
                    hour: '2-digit', minute: '2-digit', hour12: true
                  })}
                </div>
              </div>
              <div>
                <p className="text-caption text-muted-foreground mb-1">Venue</p>
                <div className="flex items-center gap-1.5 text-body-sm text-foreground">
                  <MapPin className="w-4 h-4 text-brand-500" />
                  {ticket.event_venue || 'TBD'}
                </div>
              </div>
              <div>
                <p className="text-caption text-muted-foreground mb-1">Ticket #</p>
                <p className="text-body-sm text-foreground font-mono">
                  {ticket.ticket_number || 'N/A'}
                </p>
              </div>
            </div>

            {/* Type badge */}
            <div className="flex items-center gap-2">
              <span className={`text-caption px-2.5 py-1 rounded-full font-medium ${
                ticket.is_paid ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}>
                {ticket.is_paid ? 'Paid Ticket' : 'Free Registration'}
              </span>
            </div>

            {/* QR Code or Status Message */}
            {isCancelled ? (
              <div className="flex flex-col items-center py-8">
                <XCircle className="w-16 h-16 text-red-400 mb-3" />
                <p className="text-red-500 font-medium text-body-sm">This ticket has been cancelled</p>
                <p className="text-muted-foreground text-caption mt-1">Contact event organizers for help</p>
              </div>
            ) : isPending ? (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="w-12 h-12 text-amber-400 mb-3 animate-spin" />
                <p className="text-amber-600 dark:text-amber-400 font-medium text-body-sm">Awaiting Approval</p>
                <p className="text-muted-foreground text-caption mt-1">QR code will appear once approved</p>
              </div>
            ) : qrImageUrl ? (
              <div className="flex flex-col items-center py-4">
                <div className="w-52 h-52 bg-white rounded-2xl flex items-center justify-center p-3 shadow-sm border border-border">
                  <img src={qrImageUrl} alt="QR Code" className="w-full h-full" />
                </div>
                <p className="text-muted-foreground text-caption mt-3">Show this QR code at the venue entrance</p>
                {isScanned && (
                  <p className="text-emerald-600 dark:text-emerald-400 text-caption mt-1 font-medium">
                    Checked in on {new Date(ticket.scanned_at!).toLocaleString('en-PK')}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <AlertTriangle className="w-12 h-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground text-body-sm">QR code not available</p>
              </div>
            )}

            {/* Attendee */}
            <div className="rounded-xl p-3 text-center bg-muted/50">
              <p className="text-caption text-muted-foreground">Attendee</p>
              <p className="text-foreground font-semibold">{ticket.attendee_name}</p>
            </div>
          </div>
        </motion.div>

        {/* Download Button - only show for approved tickets with QR */}
        {isApproved && qrImageUrl && !isCancelled && (
          <Button
            onClick={handleDownload}
            disabled={downloading}
            variant="secondary"
            className="w-full"
          >
            {downloading ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Download className="w-5 h-5 mr-2" />
            )}
            {downloading ? 'Generating...' : 'Save Ticket as Image'}
          </Button>
        )}
      </div>
    </div>
  );
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max - 1) + '...' : str;
}
