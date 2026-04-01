'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, MapPin, Clock, Users, Star, Ticket, Heart, Share2, Loader2, CheckCircle2, Copy, X, AlertTriangle } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { SmartImage } from '@/components/SmartImage';

interface EventDetail {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  is_paid: boolean;
  location: string;
  event_start: string;
  event_end: string;
  ticket_price: number;
  max_tickets: number | null;
  max_participants: number | null;
  participants_count: number;
  tickets_reserved: number;
  registration_end: string;
  category_name: string;
  society_id: string;
  society_name: string;
  society_logo: string | null;
  tickets_sold: number;
  avg_rating: number;
  rating_count: number;
  is_cancelled: boolean;
}

interface UserRegistration {
  hasTicket: boolean;
  status?: string;
  ticketId?: string;
  paymentReference?: string | null;
  paymentProofStatus?: string | null;
  paymentRejectionReason?: string | null;
  hasProof?: boolean;
  selectedWalletId?: string | null;
}

interface PaymentWallet {
  id: string;
  wallet_type: 'EASYPAISA' | 'JAZZCASH' | 'BANK';
  account_title: string;
  account_number: string | null;
  iban: string | null;
  bank_name: string | null;
  branch_name: string | null;
  instructions: string | null;
  is_enabled: boolean;
  is_default: boolean;
  display_order: number;
}

interface PaymentDetails {
  provider: string | null;
  recipient_name: string | null;
  account_number: string | null;
  iban: string | null;
  instructions: string | null;
  configured: boolean;
  wallets: PaymentWallet[];
  active_wallet_id: string | null;
}

function EventDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Skeleton className="h-[52vh] min-h-[320px] w-full" />
      <div className="relative -mt-6 rounded-t-[2rem] bg-background pt-6 pb-28 px-5 space-y-5">
        <Skeleton className="h-7 w-56" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

function walletTypeLabel(type: PaymentWallet['wallet_type'] | null | undefined): string {
  if (type === 'EASYPAISA') return 'Easypaisa';
  if (type === 'JAZZCASH') return 'JazzCash';
  if (type === 'BANK') return 'Bank Account';
  return 'Wallet';
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { requireAuth } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [userRegistration, setUserRegistration] = useState<UserRegistration>({ hasTicket: false });
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);

  useEffect(() => {
    setUserRegistration({ hasTicket: false });
    setPaymentDetails(null);
    setSelectedWalletId(null);

    fetch(`/api/events/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setEvent(data.event);
        if (data.userRegistration) {
          setUserRegistration(data.userRegistration);
        }
        const details: PaymentDetails | null = data.paymentDetails || null;
        setPaymentDetails(details);
        if (details?.wallets?.length) {
          const preferred =
            data?.userRegistration?.selectedWalletId &&
            details.wallets.some((wallet) => wallet.id === data.userRegistration.selectedWalletId)
              ? data.userRegistration.selectedWalletId
              : details.active_wallet_id || details.wallets[0].id;
          setSelectedWalletId(preferred || null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  const selectedWallet =
    paymentDetails?.wallets?.find((wallet) => wallet.id === selectedWalletId) ||
    paymentDetails?.wallets?.find((wallet) => wallet.id === paymentDetails.active_wallet_id) ||
    paymentDetails?.wallets?.[0] ||
    null;

  const handleCTA = async () => {
    if (!requireAuth('Sign in to buy tickets or register for events')) return;
    if (!event || registering) return;

    setRegistering(true);
    try {
      const isFreeEvent = !event.is_paid;
      if (!isFreeEvent) {
        if (!paymentDetails?.configured) {
          toast.error('Payment details are not configured for this event yet');
          return;
        }
        setShowPaymentModal(true);
        return;
      }

      const url = isFreeEvent
        ? `/api/events/${event.id}/register`
        : `/api/events/${event.id}/purchase-ticket`;

      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Something went wrong');
        return;
      }

      if (isFreeEvent) {
        if (data.waitlisted) {
          toast.info('Added to Waitlist', { description: `You're #${data.waitlist?.position} on the waitlist` });
        } else {
          toast.success('Registered!', { description: `You're registered for "${event.title}"` });
        }
      }

      router.push('/tickets');
    } catch {
      toast.error('Network Error', { description: 'Please check your connection and try again' });
    } finally {
      setRegistering(false);
    }
  };

  const handleProofFile = (file: File | null) => {
    setProofFile(file);
    if (proofPreview) {
      URL.revokeObjectURL(proofPreview);
      setProofPreview(null);
    }
    if (file) {
      setProofPreview(URL.createObjectURL(file));
    }
  };

  const submitPaidProof = async () => {
    if (!event || !paymentDetails?.configured) return;
    if (!proofFile) {
      toast.error('Please upload payment screenshot');
      return;
    }
    if (!transactionRef.trim()) {
      toast.error('Please enter transaction/reference ID');
      return;
    }

    setSubmittingProof(true);
    try {
      let ticketId = userRegistration.ticketId;
      let paymentReference = userRegistration.paymentReference || null;
      const walletIdForRequest = selectedWallet?.id || null;

      const purchaseRes = await fetch(`/api/events/${event.id}/purchase-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_id: walletIdForRequest }),
      });
      const purchaseData = await purchaseRes.json();

      if (!purchaseRes.ok) {
        // Pending ticket already exists, reuse that canonical ticket id.
        if (purchaseRes.status === 409 && purchaseData.ticketId) {
          ticketId = purchaseData.ticketId;
          paymentReference = purchaseData.paymentReference || purchaseData.ticket?.paymentReference || paymentReference;
        } else {
          toast.error(purchaseData.error || 'Unable to create ticket request');
          return;
        }
      } else {
        ticketId = purchaseData.ticket?.id || purchaseData.ticketId;
        paymentReference = purchaseData.ticket?.paymentReference || null;
        setUserRegistration({
          hasTicket: true,
          status: 'PENDING_VERIFICATION',
          ticketId,
          paymentReference,
          hasProof: false,
          selectedWalletId: walletIdForRequest,
        });
      }

      if (!ticketId) {
        toast.error('Unable to resolve ticket for payment proof submission');
        return;
      }

      const fd = new FormData();
      fd.append('ticket_id', ticketId);
      fd.append('event_id', event.id);
      if (paymentReference) {
        fd.append('payment_reference', paymentReference);
      }
      if (walletIdForRequest) {
        fd.append('wallet_id', walletIdForRequest);
      }
      fd.append('transaction_reference', transactionRef.trim());
      fd.append('note', paymentNote.trim());
      fd.append('proof', proofFile);

      const proofRes = await fetch('/api/payments/submit-proof', {
        method: 'POST',
        body: fd,
      });
      const proofData = await proofRes.json();

      if (!proofRes.ok) {
        toast.error(proofData.error || 'Failed to submit payment proof');
        return;
      }

      setUserRegistration((prev) => ({
        ...prev,
        hasTicket: true,
        status: 'PENDING',
        ticketId,
        paymentReference: prev.paymentReference || paymentReference,
        hasProof: true,
        paymentProofStatus: 'PENDING',
        selectedWalletId: walletIdForRequest,
      }));

      setShowPaymentModal(false);
      toast.success('Payment proof submitted', {
        description: 'Your ticket is pending society verification',
      });
      router.push(`/tickets/${ticketId}`);
    } catch {
      toast.error('Network error while submitting payment proof');
    } finally {
      setSubmittingProof(false);
    }
  };


  if (loading) return <EventDetailSkeleton />;

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-muted-foreground gap-4">
        <p className="text-h3">Event not found</p>
        <Button variant="secondary" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  const startDate = new Date(event.event_start);
  const endDate = new Date(event.event_end);

  // Calculate spots left based on event type
  // For paid events: use max_tickets and tickets_reserved (pending + approved)
  // For free events: use max_participants and participants_count
  const isFree = !event.is_paid;
  const maxCapacity = isFree ? event.max_participants : event.max_tickets;
  const currentCount = isFree
    ? event.participants_count
    : parseInt(String(event.tickets_reserved || 0));
  const spotsLeft = maxCapacity ? maxCapacity - currentCount : null;
  const isSoldOut = spotsLeft !== null && spotsLeft <= 0;
  const isUpcoming = startDate > new Date();

  // User registration status
  const hasExistingTicket = userRegistration.hasTicket;
  const ticketStatus = userRegistration.status;
  const isTicketPending = ticketStatus === 'PENDING';
  const isTicketPendingVerification = ticketStatus === 'PENDING_VERIFICATION';
  const isTicketNeedsReupload = ticketStatus === 'NEEDS_REUPLOAD';
  const isTicketApproved = ticketStatus === 'APPROVED';

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero banner ── */}
      <div className="relative h-[52vh] min-h-[320px]">
        {event.banner_url ? (
          <Image
            src={event.banner_url}
            alt={event.title}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-400 via-brand-500 to-surface-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 z-10 safe-top">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Go back"
            className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50 rounded-xl"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!requireAuth('Sign in to save events to your favorites')) return;
                setIsFavorite(!isFavorite);
              }}
              aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
              className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50 rounded-xl"
            >
              <Heart className={cn('w-5 h-5', isFavorite && 'fill-red-500 text-red-500')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Share event"
              className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50 rounded-xl"
            >
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
          {event.category_name && (
            <Badge variant="solid" size="md" className="mb-2">
              {event.category_name}
            </Badge>
          )}
          <h1 className="text-display text-white leading-tight">{event.title}</h1>
        </div>
      </div>

      {/* ── Content sheet ── */}
      <div className="relative -mt-6 rounded-t-[2rem] bg-background z-20 pt-6 pb-28">
        {/* Society link */}
        <Link
          href={`/societies/${event.society_id}`}
          className="mx-5 flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-brand-200 dark:hover:border-brand-900/40 transition-colors mb-5"
        >
          <Avatar size="md" className="rounded-xl">
            {event.society_logo ? <AvatarImage src={event.society_logo} alt={event.society_name} /> : null}
            <AvatarFallback className="rounded-xl text-sm font-bold">
              {event.society_name?.[0] || 'S'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-semibold text-foreground truncate">{event.society_name}</p>
            <p className="text-caption text-muted-foreground">Organizer</p>
          </div>
        </Link>

        {/* Quick info cards */}
        <div className="px-5 grid grid-cols-2 gap-2.5 mb-6">
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Date</span>
            </div>
            <p className="text-body-sm font-semibold text-foreground">{formatDate(startDate)}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Time</span>
            </div>
            <p className="text-body-sm font-semibold text-foreground">{formatTime(startDate)} – {formatTime(endDate)}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Venue</span>
            </div>
            <p className="text-body-sm font-semibold text-foreground truncate">{event.location || 'TBA'}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Spots</span>
            </div>
            <p className={cn(
              'text-body-sm font-semibold',
              spotsLeft === null || spotsLeft > 0 ? 'text-foreground' : 'text-destructive',
            )}>
              {spotsLeft === null ? 'Unlimited' : spotsLeft > 0 ? `${spotsLeft} left` : 'Sold Out'}
            </p>
          </div>
        </div>

        {/* Rating */}
        {event.rating_count > 0 && (
          <div className="px-5 flex items-center gap-2 mb-5">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    'w-4 h-4',
                    star <= Math.round(event.avg_rating)
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-border',
                  )}
                />
              ))}
            </div>
            <span className="text-body-sm font-semibold text-foreground">{event.avg_rating}</span>
            <span className="text-caption text-muted-foreground">({event.rating_count})</span>
          </div>
        )}

        {/* About */}
        <div className="px-5 mb-6">
          <h2 className="text-h3 text-foreground mb-2">About</h2>
          <p className="text-body text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {event.description || 'No description available.'}
          </p>
        </div>
      </div>

      {/* ── Fixed bottom CTA ── */}
      {isUpcoming && (
        <motion.footer
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-modal px-4 py-3 glass-heavy border-t border-border/50 safe-bottom"
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-caption text-muted-foreground">Price</p>
              <p className="text-h2 text-foreground">
                {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
              </p>
            </div>

            {/* Already registered - show status */}
            {hasExistingTicket ? (
              <Button
                size="lg"
                className="rounded-xl px-8"
                variant={isTicketApproved ? 'soft' : 'secondary'}
                onClick={() => {
                  if (!isFree && (isTicketPendingVerification || isTicketNeedsReupload)) {
                    setShowPaymentModal(true);
                    return;
                  }
                  router.push(`/tickets/${userRegistration.ticketId}`);
                }}
              >
                {isTicketNeedsReupload ? (
                  <>
                    <AlertTriangle className="w-5 h-5" />
                    Reupload Proof
                  </>
                ) : isTicketPendingVerification ? (
                  <>
                    <Clock className="w-5 h-5" />
                    Complete Payment
                  </>
                ) : isTicketPending ? (
                  <>
                    <Clock className="w-5 h-5" />
                    Pending Approval
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    View Ticket
                  </>
                )}
              </Button>
            ) : isSoldOut ? (
              <Button
                size="lg"
                className="rounded-xl px-8"
                variant="secondary"
                disabled
              >
                Sold Out
              </Button>
            ) : (
              <Button
                size="lg"
                className="rounded-xl px-8"
                disabled={registering}
                onClick={handleCTA}
              >
                {registering ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Ticket className="w-5 h-5" />
                )}
                {registering ? 'Processing…' : isFree ? 'Register' : 'Get Ticket'}
              </Button>
            )}
          </div>
        </motion.footer>
      )}

      {showPaymentModal && event?.is_paid && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm p-4 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Submit Payment Proof</h3>
                <p className="text-sm text-muted-foreground">{event.title}</p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
              <p className="text-sm font-semibold text-foreground">Amount: Rs. {event.ticket_price}</p>
              {paymentDetails?.wallets?.length ? (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Payment Wallet</label>
                  <select
                    value={selectedWallet?.id || ''}
                    onChange={(e) => setSelectedWalletId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    {paymentDetails.wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {walletTypeLabel(wallet.wallet_type)} • {wallet.account_title}
                        {wallet.is_default ? ' (Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Method: {selectedWallet ? walletTypeLabel(selectedWallet.wallet_type) : paymentDetails?.provider || 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground">
                Recipient: {selectedWallet?.account_title || paymentDetails?.recipient_name || 'N/A'}
              </p>
              {(selectedWallet?.account_number || selectedWallet?.iban || paymentDetails?.account_number || paymentDetails?.iban) && (
                <div className="space-y-1">
                  {(selectedWallet?.account_number || paymentDetails?.account_number) && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Account/Wallet: {selectedWallet?.account_number || paymentDetails?.account_number}
                      </span>
                      <button
                        className="px-2 py-1 rounded-md bg-muted text-foreground"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedWallet?.account_number || paymentDetails?.account_number || '');
                          toast.success('Account number copied');
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {(selectedWallet?.iban || paymentDetails?.iban) && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">IBAN: {selectedWallet?.iban || paymentDetails?.iban}</span>
                      <button
                        className="px-2 py-1 rounded-md bg-muted text-foreground"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedWallet?.iban || paymentDetails?.iban || '');
                          toast.success('IBAN copied');
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {selectedWallet?.bank_name && (
                    <p className="text-xs text-muted-foreground">
                      Bank: {selectedWallet.bank_name}
                      {selectedWallet.branch_name ? ` (${selectedWallet.branch_name})` : ''}
                    </p>
                  )}
                </div>
              )}
              {(selectedWallet?.instructions || paymentDetails?.instructions) && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {selectedWallet?.instructions || paymentDetails?.instructions}
                </p>
              )}
              {userRegistration.paymentRejectionReason && (
                <p className="text-xs text-red-600">Previous review note: {userRegistration.paymentRejectionReason}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Transaction / Reference ID</label>
              <input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="Enter transfer reference"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Optional Note</label>
              <textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Any context for approver"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Payment Screenshot</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => handleProofFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {proofPreview && (
                <SmartImage src={proofPreview} alt="Payment proof preview" className="w-full rounded-lg border border-border max-h-52 object-contain bg-muted" />
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setShowPaymentModal(false)} disabled={submittingProof}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={submitPaidProof} disabled={submittingProof}>
                {submittingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submittingProof ? 'Submitting...' : 'Submit Proof'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


