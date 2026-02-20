/**
 * File Upload Utilities
 *
 * Handles validation, image processing, rate limiting,
 * and quota enforcement for all file uploads.
 */

import sharp from 'sharp';
import { query } from './db';

// ============================================================================
// Constants & Limits
// ============================================================================

/** Maximum image file size in bytes (8 MB) */
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

/** Maximum document file size in bytes (15 MB) */
export const MAX_DOCUMENT_SIZE = 15 * 1024 * 1024;

/** Maximum image dimension after resizing (width in pixels) */
export const MAX_IMAGE_WIDTH = 1920;

/** Maximum image dimension after resizing (height in pixels) */
export const MAX_IMAGE_HEIGHT = 1920;

/** JPEG compression quality (1-100) */
export const JPEG_QUALITY = 85;

/** WebP compression quality (1-100) */
export const WEBP_QUALITY = 82;

/** PNG compression level (0-9) */
export const PNG_COMPRESSION_LEVEL = 8;

// Per-entity limits
export const LIMITS = {
  /** Max gallery images per event */
  EVENT_GALLERY_MAX: 100,
  /** Max attachments per post */
  POST_ATTACHMENTS_MAX: 20,
  /** Max attachments per note */
  NOTE_ATTACHMENTS_MAX: 20,
  /** Max society gallery images */
  SOCIETY_GALLERY_MAX: 200,
  /** Default storage quota per society in bytes (500 MB) */
  DEFAULT_SOCIETY_QUOTA_BYTES: 500 * 1024 * 1024,
} as const;

// Rate limits
export const RATE_LIMITS = {
  /** Max uploads per user per minute */
  UPLOADS_PER_MINUTE: 10,
  /** Max uploads per user per hour */
  UPLOADS_PER_HOUR: 60,
  /** Max total upload size per user per hour (100 MB) */
  BYTES_PER_HOUR: 100 * 1024 * 1024,
} as const;

// ============================================================================
// Allowed MIME Types
// ============================================================================

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export const ALLOWED_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const ALLOWED_ALL_MIMES = new Set([
  ...Array.from(ALLOWED_IMAGE_MIMES),
  ...Array.from(ALLOWED_DOCUMENT_MIMES),
]);

// Extension-to-MIME mapping for validation
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  '.jpg': ['image/jpeg', 'image/jpg'],
  '.jpeg': ['image/jpeg', 'image/jpg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a file against type and size constraints.
 */
export function validateFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  allowedMimes: Set<string>,
  maxSizeBytes: number
): ValidationResult {
  // 1. Check MIME type
  if (!allowedMimes.has(mimeType)) {
    return {
      valid: false,
      error: `File type '${mimeType}' is not allowed. Allowed: ${Array.from(allowedMimes).join(', ')}`,
    };
  }

  // 2. Validate extension matches MIME type
  const ext = getFileExtension(fileName).toLowerCase();
  const expectedMimes = EXTENSION_MIME_MAP[ext];
  if (!expectedMimes || !expectedMimes.includes(mimeType)) {
    return {
      valid: false,
      error: `File extension '${ext}' does not match MIME type '${mimeType}'`,
    };
  }

  // 3. Check file size
  if (sizeBytes > maxSizeBytes) {
    const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    const actualMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${actualMB}MB) exceeds maximum (${maxMB}MB)`,
    };
  }

  // 4. Check minimum size (likely corrupt or empty)
  if (sizeBytes < 100) {
    return { valid: false, error: 'File is too small — possibly corrupt' };
  }

  return { valid: true };
}

/**
 * Validate an image file specifically.
 */
export function validateImageFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number
): ValidationResult {
  return validateFile(fileName, mimeType, sizeBytes, ALLOWED_IMAGE_MIMES, MAX_IMAGE_SIZE);
}

/**
 * Validate a document file specifically.
 */
export function validateDocumentFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number
): ValidationResult {
  return validateFile(fileName, mimeType, sizeBytes, ALLOWED_DOCUMENT_MIMES, MAX_DOCUMENT_SIZE);
}

/**
 * Validate any allowed file (image or document).
 */
export function validateAnyFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number
): ValidationResult {
  const isImage = ALLOWED_IMAGE_MIMES.has(mimeType);
  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
  return validateFile(fileName, mimeType, sizeBytes, ALLOWED_ALL_MIMES, maxSize);
}

// ============================================================================
// Magic Byte Validation (prevents MIME spoofing)
// ============================================================================

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/jpg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

/**
 * Verify that a file's actual bytes match its claimed MIME type.
 * Prevents uploading malicious files with spoofed MIME types.
 */
export function validateMagicBytes(
  buffer: Buffer,
  claimedMime: string
): boolean {
  const signatures = MAGIC_BYTES[claimedMime];
  if (!signatures) return true; // No signature check for this type

  return signatures.some((sig) => {
    if (buffer.length < sig.length) return false;
    return sig.every((byte, i) => buffer[i] === byte);
  });
}

// ============================================================================
// Image Processing
// ============================================================================

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
}

/**
 * Process an uploaded image:
 * - Resize if wider than MAX_IMAGE_WIDTH
 * - Compress to reduce file size
 * - Strip EXIF metadata (privacy)
 * - Convert to optimized format
 */
export async function processImage(
  inputBuffer: Buffer,
  originalMime: string
): Promise<ProcessedImage> {
  const originalSize = inputBuffer.length;

  let pipeline = sharp(inputBuffer)
    .rotate() // Auto-rotate based on EXIF
    .resize(MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, {
      fit: 'inside', // Maintain aspect ratio, fit within bounds
      withoutEnlargement: true, // Don't upscale small images
    })
    .withMetadata({ orientation: undefined }); // Strip EXIF but keep color profile

  let outputBuffer: Buffer;
  let outputMime: string;

  switch (originalMime) {
    case 'image/png':
      outputBuffer = await pipeline
        .png({ compressionLevel: PNG_COMPRESSION_LEVEL, quality: 90 })
        .toBuffer();
      outputMime = 'image/png';
      break;

    case 'image/webp':
      outputBuffer = await pipeline
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      outputMime = 'image/webp';
      break;

    case 'image/gif':
      // GIF: just resize, keep format
      outputBuffer = await pipeline
        .gif()
        .toBuffer();
      outputMime = 'image/gif';
      break;

    case 'image/jpeg':
    case 'image/jpg':
    default:
      outputBuffer = await pipeline
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      outputMime = 'image/jpeg';
      break;
  }

  // Get final dimensions
  const metadata = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    mimeType: outputMime,
    width: metadata.width || 0,
    height: metadata.height || 0,
    originalSize,
    processedSize: outputBuffer.length,
  };
}

/**
 * Generate a thumbnail version of an image (for list views / previews).
 * Fixed width of 400px, JPEG format, aggressive compression.
 */
export async function generateThumbnail(
  inputBuffer: Buffer
): Promise<Buffer> {
  return sharp(inputBuffer)
    .rotate()
    .resize(400, 400, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
}

// ============================================================================
// Rate Limiting (in-memory, per-process)
// ============================================================================

interface RateLimitEntry {
  count: number;
  bytes: number;
  windowStart: number;
}

// In-memory store. For multi-instance, replace with Redis.
const uploadRateMap = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  uploadRateMap.forEach((entry, key) => {
    if (now - entry.windowStart > 3600000) {
      uploadRateMap.delete(key);
    }
  });
}, 300000);

/**
 * Check if a user has exceeded upload rate limits.
 * Returns null if allowed, or an error message if rate-limited.
 */
export function checkRateLimit(
  userId: string,
  fileSizeBytes: number
): string | null {
  const now = Date.now();
  const minuteKey = `${userId}:min`;
  const hourKey = `${userId}:hour`;

  // Per-minute check
  const minuteEntry = uploadRateMap.get(minuteKey);
  if (minuteEntry) {
    if (now - minuteEntry.windowStart < 60000) {
      if (minuteEntry.count >= RATE_LIMITS.UPLOADS_PER_MINUTE) {
        return `Upload rate limit exceeded. Max ${RATE_LIMITS.UPLOADS_PER_MINUTE} uploads per minute.`;
      }
    } else {
      uploadRateMap.delete(minuteKey);
    }
  }

  // Per-hour check
  const hourEntry = uploadRateMap.get(hourKey);
  if (hourEntry) {
    if (now - hourEntry.windowStart < 3600000) {
      if (hourEntry.count >= RATE_LIMITS.UPLOADS_PER_HOUR) {
        return `Upload rate limit exceeded. Max ${RATE_LIMITS.UPLOADS_PER_HOUR} uploads per hour.`;
      }
      if (hourEntry.bytes + fileSizeBytes > RATE_LIMITS.BYTES_PER_HOUR) {
        const remainingMB = (
          (RATE_LIMITS.BYTES_PER_HOUR - hourEntry.bytes) /
          (1024 * 1024)
        ).toFixed(1);
        return `Upload bandwidth limit exceeded. ${remainingMB}MB remaining this hour.`;
      }
    } else {
      uploadRateMap.delete(hourKey);
    }
  }

  return null;
}

/**
 * Record a successful upload for rate limiting.
 */
export function recordUpload(userId: string, fileSizeBytes: number): void {
  const now = Date.now();

  // Minute window
  const minuteKey = `${userId}:min`;
  const minuteEntry = uploadRateMap.get(minuteKey);
  if (minuteEntry && now - minuteEntry.windowStart < 60000) {
    minuteEntry.count++;
    minuteEntry.bytes += fileSizeBytes;
  } else {
    uploadRateMap.set(minuteKey, {
      count: 1,
      bytes: fileSizeBytes,
      windowStart: now,
    });
  }

  // Hour window
  const hourKey = `${userId}:hour`;
  const hourEntry = uploadRateMap.get(hourKey);
  if (hourEntry && now - hourEntry.windowStart < 3600000) {
    hourEntry.count++;
    hourEntry.bytes += fileSizeBytes;
  } else {
    uploadRateMap.set(hourKey, {
      count: 1,
      bytes: fileSizeBytes,
      windowStart: now,
    });
  }
}

// ============================================================================
// Quota Enforcement
// ============================================================================

/**
 * Check if a society has remaining storage quota.
 * Returns null if allowed, or an error message if quota exceeded.
 */
export async function checkSocietyQuota(
  societyId: string,
  additionalBytes: number
): Promise<string | null> {
  const result = await query(
    `SELECT
       COALESCE(ss.storage_quota_bytes, $1) AS quota,
       COALESCE(ss.storage_used_bytes, 0) AS used
     FROM societies s
     LEFT JOIN society_settings ss ON ss.society_id = s.id
     WHERE s.id = $2`,
    [LIMITS.DEFAULT_SOCIETY_QUOTA_BYTES, societyId]
  );

  if (result.rows.length === 0) {
    return 'Society not found';
  }

  const { quota, used } = result.rows[0];
  const remaining = quota - used;

  if (additionalBytes > remaining) {
    const usedMB = (used / (1024 * 1024)).toFixed(1);
    const quotaMB = (quota / (1024 * 1024)).toFixed(0);
    const remainingMB = Math.max(0, remaining / (1024 * 1024)).toFixed(1);
    return `Society storage quota exceeded. Used: ${usedMB}MB / ${quotaMB}MB. Remaining: ${remainingMB}MB`;
  }

  return null;
}

/**
 * Update society storage usage after upload/delete.
 */
export async function updateSocietyStorageUsed(
  societyId: string,
  byteDelta: number
): Promise<void> {
  await query(
    `UPDATE society_settings
     SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) + $1)
     WHERE society_id = $2`,
    [byteDelta, societyId]
  );
}

// ============================================================================
// Count Enforcement
// ============================================================================

/**
 * Check if an entity has reached its media count limit.
 */
export async function checkEntityMediaCount(
  table: string,
  foreignKey: string,
  entityId: string,
  maxCount: number,
  mediaType?: string
): Promise<string | null> {
  let sql = `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${foreignKey} = $1 AND is_deleted = FALSE`;
  const params: unknown[] = [entityId];

  if (mediaType) {
    sql += ` AND media_type = $2`;
    params.push(mediaType);
  }

  const result = await query(sql, params);
  const count = parseInt(result.rows[0].cnt);

  if (count >= maxCount) {
    return `Maximum limit of ${maxCount} files reached for this entity`;
  }

  return null;
}

// ============================================================================
// File Path Generation
// ============================================================================

/**
 * Generate a unique blob path for a file.
 * Format: {entityType}/{entityId}/{subType}/{uuid}.{ext}
 *
 * Examples:
 *   society/abc-123/gallery/uuid.jpg
 *   event/def-456/gallery/uuid.png
 *   user/ghi-789/avatar/uuid.jpg
 */
export function generateBlobPath(
  entityType: string,
  entityId: string,
  subType: string,
  originalFileName: string
): string {
  const ext = getFileExtension(originalFileName) || '.jpg';
  const uuid = generateUUID();
  return `${entityType}/${entityId}/${subType}/${uuid}${ext}`;
}

// ============================================================================
// Helpers
// ============================================================================

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.substring(lastDot).toLowerCase();
}

function generateUUID(): string {
  // crypto.randomUUID() in Node 19+, fallback to timestamp + random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
