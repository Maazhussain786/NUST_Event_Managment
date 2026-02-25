import crypto from 'crypto';

/**
 * QR Code utility — HMAC-signed payloads for tamper-proof attendance.
 *
 * Payload format:  {type}:{id}:{eventId}:{userId}:{signature}
 *
 * - type: "T" (ticket) or "R" (registration)
 * - id: ticket UUID or registration UUID
 * - eventId: event UUID
 * - userId: user UUID
 * - signature: HMAC-SHA256 of the data portion
 *
 * Verification is stateless — no DB write needed to validate authenticity.
 */

function getQrSecret(): string {
  const secret = process.env.QR_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('QR_SECRET or JWT_SECRET environment variable is required');
  }
  return secret;
}

export type QrType = 'T' | 'R'; // T = Ticket, R = Registration

export interface QrPayloadData {
  type: QrType;
  id: string;       // ticket_id or registration_id
  eventId: string;
  userId: string;
}

/**
 * Generate the data portion of the QR payload (without signature).
 */
function buildDataString(data: QrPayloadData): string {
  return `${data.type}:${data.id}:${data.eventId}:${data.userId}`;
}

/**
 * Compute HMAC-SHA256 signature for the data.
 */
function sign(data: string): string {
  return crypto
    .createHmac('sha256', getQrSecret())
    .update(data)
    .digest('hex');
}

/**
 * Generate a tamper-proof QR payload string.
 */
export function generateQrPayload(data: QrPayloadData): string {
  const dataStr = buildDataString(data);
  const signature = sign(dataStr);
  return `${dataStr}:${signature}`;
}

/**
 * Verify and parse a QR payload string.
 * Returns null if signature is invalid or payload malformed.
 */
export function verifyQrPayload(payload: string): QrPayloadData | null {
  const parts = payload.split(':');
  if (parts.length !== 5) return null;

  const [type, id, eventId, userId, signature] = parts;

  // Validate type
  if (type !== 'T' && type !== 'R') return null;

  // Validate UUIDs (basic check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id) || !uuidRegex.test(eventId) || !uuidRegex.test(userId)) {
    return null;
  }

  // Verify signature
  const dataStr = `${type}:${id}:${eventId}:${userId}`;
  const expectedSig = sign(dataStr);

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    return null;
  }

  return { type: type as QrType, id, eventId, userId };
}
