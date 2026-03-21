'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, MapPin, Clock, Download, Loader2, AlertTriangle, XCircle, User, Hash, Building2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { cacheTicket, getCachedTicket } from '@/lib/ticket-cache';
import { StatusTimeline, StatusBadge } from '@/components/StatusTimeline';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TicketDetail {
  id: string;
  ticket_number: string;
  status: string;
  ticket_status?: string;
  purchased_at: string;
  event_id?: string;
  amount?: number;
  payment_reference?: string;
  payment_proof_url?: string | null;
  payment_proof_status?: string | null;
  transaction_reference?: string;
  student_note?: string | null;
  proof_submitted_at?: string | null;
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
        const ticketData = data?.ticket ?? data;
        if (!ticketData?.id) {
          throw new Error('Invalid ticket response');
        }
        setTicket(ticketData);

        // Generate QR code image if qr_data exists
        let qrUrl: string | null = null;
        if (ticketData.qr_data) {
          qrUrl = await QRCode.toDataURL(ticketData.qr_data, {
            width: 300,
            margin: 3,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          });
          setQrImageUrl(qrUrl);
        }

        // Cache ticket for offline access (only approved tickets with QR)
        if (ticketData.status === 'APPROVED' && ticketData.qr_data) {
          cacheTicket({
            id: ticketData.id,
            event_id: ticketData.event_id || '',
            event_title: ticketData.event_title,
            event_date: ticketData.event_start,
            event_venue: ticketData.event_venue || '',
            event_banner_url: ticketData.event_banner || undefined,
            society_name: ticketData.society_name,
            ticket_number: ticketData.ticket_number,
            status: ticketData.status,
            qr_data: ticketData.qr_data,
            qr_image_data_url: qrUrl || undefined,
            attendee_name: ticketData.attendee_name,
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
                  width: 300, margin: 3,
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

      const W = 600, H = 1000;
      canvas.width = W;
      canvas.height = H;

      // Outer background (dark navy)
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, W, H);

      // Inner ticket card (white with rounded corners simulation)
      const cardX = 30, cardY = 30, cardW = W - 60, cardH = H - 60;
      ctx.fillStyle = '#ffffff';
      roundedRect(ctx, cardX, cardY, cardW, cardH, 24);
      ctx.fill();

      // Event banner area
      const bannerH = 180;
      ctx.save();
      roundedRectClip(ctx, cardX, cardY, cardW, bannerH, 24, 24, 0, 0);

      if (ticket.event_banner) {
        const bannerImg = new Image();
        bannerImg.crossOrigin = 'anonymous';
        bannerImg.src = ticket.event_banner;
        await new Promise<void>((resolve) => {
          bannerImg.onload = () => {
            ctx.drawImage(bannerImg, cardX, cardY, cardW, bannerH);
            resolve();
          };
          bannerImg.onerror = () => {
            // Fallback gradient
            const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + bannerH);
            grad.addColorStop(0, '#6366f1');
            grad.addColorStop(1, '#4f46e5');
            ctx.fillStyle = grad;
            ctx.fillRect(cardX, cardY, cardW, bannerH);
            resolve();
          };
        });
      } else {
        const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + bannerH);
        grad.addColorStop(0, '#6366f1');
        grad.addColorStop(1, '#4f46e5');
        ctx.fillStyle = grad;
        ctx.fillRect(cardX, cardY, cardW, bannerH);
      }

      // Overlay for text readability
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(cardX, cardY, cardW, bannerH);
      ctx.restore();

      // Event title on banner
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      wrapText(ctx, ticket.event_title, cardX + 24, cardY + bannerH - 50, cardW - 48, 26);

      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(ticket.society_name, cardX + 24, cardY + bannerH - 20);

      // Perforation line with cutouts
      const perfY = cardY + bannerH + 20;
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(cardX - 12, perfY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cardX + cardW + 12, perfY, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cardX + 24, perfY);
      ctx.lineTo(cardX + cardW - 24, perfY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Details section
      let detailY = perfY + 40;
      const detailX = cardX + 24;
      const col2X = cardX + cardW / 2 + 12;

      const dateStr = new Date(ticket.event_start).toLocaleDateString('en-PK', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
      const timeStr = new Date(ticket.event_start).toLocaleTimeString('en-PK', {
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      // Row 1: Date & Time
      drawDetailItem(ctx, detailX, detailY, 'Date', dateStr);
      drawDetailItem(ctx, col2X, detailY, 'Time', timeStr);
      detailY += 60;

      // Row 2: Venue & Ticket #
      drawDetailItem(ctx, detailX, detailY, 'Venue', ticket.event_venue || 'TBD', cardW / 2 - 36);
      drawDetailItem(ctx, col2X, detailY, 'Ticket #', ticket.ticket_number || 'N/A');
      detailY += 60;

      // Row 3: Attendee
      drawDetailItem(ctx, detailX, detailY, 'Attendee', ticket.attendee_name, cardW - 48);
      detailY += 70;

      // Perforation before QR
      const qrPerfY = detailY;
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(cardX - 12, qrPerfY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cardX + cardW + 12, qrPerfY, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cardX + 24, qrPerfY);
      ctx.lineTo(cardX + cardW - 24, qrPerfY);
      ctx.stroke();
      ctx.setLineDash([]);

      // QR Code section
      const qrImg = new Image();
      qrImg.src = qrImageUrl;
      await new Promise<void>((resolve) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => resolve();
      });

      const qrSize = 180;
      const qrX = (W - qrSize) / 2;
      const qrY = qrPerfY + 30;

      // QR background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Instruction text
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Show this QR code at the venue entrance', W / 2, qrY + qrSize + 45);
      ctx.textAlign = 'start';

      // Watermark
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NUST Events Platform', W / 2, H - 15);
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950">
        <AlertTriangle className="w-16 h-16 mb-4 text-amber-400" />
        <h2 className="mb-1 text-xl font-bold text-white">Ticket Not Found</h2>
        <p className="mb-6 text-white/60 text-sm text-center">{error || 'This ticket could not be loaded.'}</p>
        <Button onClick={() => router.push('/tickets')} variant="secondary">
          Back to Tickets
        </Button>
      </div>
    );
  }

  const isCancelled = ticket.is_cancelled || ticket.status === 'CANCELLED' || ticket.status === 'REJECTED';
  const isPending = ticket.status === 'PENDING' || ticket.status === 'PENDING_VERIFICATION' || ticket.status === 'NEEDS_REUPLOAD';
  const isApproved = (ticket.ticket_status || ticket.status) === 'APPROVED';
  const isNeedsReupload = ticket.status === 'NEEDS_REUPLOAD';
  const isPendingVerification = ticket.status === 'PENDING_VERIFICATION';
  const isScanned = !!ticket.scanned_at;
  const effectiveStatus = isScanned ? 'CHECKED_IN' : ((ticket.ticket_status || ticket.status) as string);

  const dateFormatted = new Date(ticket.event_start).toLocaleDateString('en-PK', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
  const timeFormatted = new Date(ticket.event_start).toLocaleTimeString('en-PK', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950">
      {/* Hidden canvas for download */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="sticky top-0 z-50">
        <div
          className="flex items-center justify-between px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)', paddingBottom: '0.75rem' }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-white">Your Ticket</h1>
          {isApproved && qrImageUrl && !isCancelled ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              disabled={downloading}
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              {downloading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
            </Button>
          ) : (
            <div className="w-10" /> // Spacer for centering
          )}
        </div>
      </header>

      <div className="px-4 pb-8">
        {/* Status Section - Above Ticket */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4"
        >
          <StatusTimeline status={effectiveStatus} />
          <div className="mt-3">
            <StatusBadge
              status={effectiveStatus}
              reason={ticket.status === 'REJECTED' ? ticket.rejection_reason : undefined}
            />
          </div>
        </motion.div>

        {ticket.is_paid && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white"
          >
            <h3 className="text-sm font-semibold mb-2">Payment Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/75">
              <p>Amount: <span className="text-white">Rs. {Number(ticket.amount || 0).toLocaleString()}</span></p>
              <p>Payment Ref: <span className="text-white">{ticket.payment_reference || 'N/A'}</span></p>
              <p>Proof Status: <span className="text-white">{ticket.payment_proof_status || 'Not submitted'}</span></p>
              <p>Txn Ref: <span className="text-white">{ticket.transaction_reference || 'N/A'}</span></p>
            </div>
            {ticket.proof_submitted_at && (
              <p className="text-xs text-white/70 mt-2">Submitted: {new Date(ticket.proof_submitted_at).toLocaleString('en-PK')}</p>
            )}
            {ticket.student_note && (
              <p className="text-xs text-white/70 mt-1">Note: {ticket.student_note}</p>
            )}
            {ticket.payment_proof_url && (
              <a href={ticket.payment_proof_url} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-xs text-brand-300 hover:underline">
                View submitted screenshot
              </a>
            )}
            {isNeedsReupload && (
              <p className="text-xs text-amber-300 mt-2">Reupload requested by society. Go back to event page and submit a new screenshot.</p>
            )}
            {isPendingVerification && (
              <p className="text-xs text-amber-300 mt-2">Submit payment proof from event page to start verification.</p>
            )}
          </motion.div>
        )}

        {/* Premium Ticket Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 100 }}
          className={cn(
            'relative overflow-hidden rounded-3xl bg-white dark:bg-zinc-100 shadow-2xl',
            isCancelled && 'opacity-70 grayscale-[30%]'
          )}
        >
          {/* Event Banner */}
          <div className="relative aspect-[16/9] overflow-hidden">
            {ticket.event_banner ? (
              <img
                src={ticket.event_banner}
                alt={ticket.event_title}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            {/* Event info overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <h2 className="text-xl font-bold text-white leading-tight line-clamp-2 drop-shadow-lg">
                {ticket.event_title}
              </h2>
              <p className="mt-1 text-sm text-white/85 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                {ticket.society_name}
              </p>
            </div>

            {/* Type Badge */}
            <div className="absolute top-4 right-4">
              <span className={cn(
                'px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm',
                ticket.is_paid
                  ? 'bg-amber-500/90 text-white'
                  : 'bg-emerald-500/90 text-white'
              )}>
                {ticket.is_paid ? 'PAID' : 'FREE'}
              </span>
            </div>
          </div>

          {/* Perforation Divider */}
          <div className="relative h-6">
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950" />
            <div className="absolute inset-x-6 top-1/2 border-t-2 border-dashed border-gray-300" />
          </div>

          {/* Ticket Details */}
          <div className="px-5 pb-2">
            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Date</p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-900">{dateFormatted}</span>
                </div>
              </div>

              {/* Time */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Time</p>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-900">{timeFormatted}</span>
                </div>
              </div>

              {/* Venue */}
              <div className="space-y-1 col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Venue</p>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-900 line-clamp-1">{ticket.event_venue || 'To be announced'}</span>
                </div>
              </div>

              {/* Attendee */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Attendee</p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-900 truncate">{ticket.attendee_name}</span>
                </div>
              </div>

              {/* Ticket Number */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Ticket #</p>
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-mono font-medium text-gray-900">{ticket.ticket_number || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Second Perforation */}
          <div className="relative h-6 mt-2">
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950" />
            <div className="absolute inset-x-6 top-1/2 border-t-2 border-dashed border-gray-300" />
          </div>

          {/* QR Code Section */}
          <div className="px-5 pb-6 pt-2">
            {isCancelled ? (
              <div className="flex flex-col items-center py-8">
                <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
                  <XCircle className="w-10 h-10 text-red-500" />
                </div>
                <p className="font-semibold text-red-600 text-base">Ticket Cancelled</p>
                <p className="mt-1 text-gray-500 text-sm text-center">
                  Contact event organizers for assistance
                </p>
              </div>
            ) : isPending ? (
              <div className="flex flex-col items-center py-8">
                <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                </div>
                <p className="font-semibold text-amber-600 text-base">
                  {isNeedsReupload ? 'Reupload Required' : isPendingVerification ? 'Proof Needed' : 'Awaiting Approval'}
                </p>
                <p className="mt-1 text-gray-500 text-sm text-center">
                  {isNeedsReupload
                    ? 'Upload an updated screenshot from event page'
                    : isPendingVerification
                      ? 'Submit your payment screenshot from event page'
                      : 'Your QR code will appear once approved'}
                </p>
              </div>
            ) : qrImageUrl ? (
              <div className="flex flex-col items-center">
                {/* QR Container with white padding for scanability */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                  <img
                    src={qrImageUrl}
                    alt="Ticket QR Code"
                    className="w-48 h-48 sm:w-56 sm:h-56"
                  />
                </div>

                <p className="mt-4 text-gray-600 text-sm font-medium text-center">
                  Show this QR code at the entrance
                </p>

                {isScanned && (
                  <div className="mt-3 px-4 py-2 bg-emerald-50 rounded-full">
                    <p className="text-emerald-600 text-xs font-medium">
                      ✓ Checked in on {new Date(ticket.scanned_at!).toLocaleString('en-PK', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-10 h-10 text-gray-400" />
                </div>
                <p className="font-semibold text-gray-600 text-base">QR Code Unavailable</p>
                <p className="mt-1 text-gray-500 text-sm text-center">
                  Please contact support
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Bottom safe area spacing */}
        <div className="h-20 lg:h-4" />
      </div>
    </div>
  );
}

// ============================================================================
// Canvas Helper Functions
// ============================================================================

function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max - 1) + '…' : str;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundedRectClip(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  tl: number, tr: number, br: number, bl: number
) {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
  ctx.clip();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, maxWidth: number, lineHeight: number
) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
}

function drawDetailItem(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, label: string, value: string, maxWidth?: number
) {
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.fillText(label.toUpperCase(), x, y);

  ctx.fillStyle = '#111827';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  const displayValue = maxWidth ? truncate(value, Math.floor(maxWidth / 7)) : value;
  ctx.fillText(displayValue, x, y + 18);
}
