/**
 * Azure Blob Storage Client
 *
 * Handles all file uploads/downloads to Azure Blob Storage.
 * Files are organized in containers by type:
 *   - profile-pictures  (user avatars)
 *   - society-media     (logos, covers, gallery)
 *   - event-media       (thumbnails, banners, gallery, documents)
 *   - post-attachments  (images/PDFs on posts)
 *   - note-attachments  (internal organizer files)
 */

import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

// ============================================================================
// Configuration
// ============================================================================

const connectionString = process.env.AZURE_BLOB_CONNECTION_STRING;
const explicitAccountName = process.env.AZURE_BLOB_ACCOUNT_NAME || "";
const explicitAccountKey = process.env.AZURE_BLOB_ACCOUNT_KEY || "";
const cdnBaseUrl = process.env.AZURE_BLOB_CDN_URL; // optional CDN

function getConnectionStringValue(key: string): string {
  if (!connectionString) return "";

  const parts = connectionString.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if ((k || "").trim().toLowerCase() === key.toLowerCase()) {
      return rest.join("=").trim();
    }
  }

  return "";
}

const accountName =
  explicitAccountName || getConnectionStringValue("AccountName");
const accountKey = explicitAccountKey || getConnectionStringValue("AccountKey");

if (!connectionString) {
  console.warn(
    "AZURE_BLOB_CONNECTION_STRING not set. Blob storage operations will fail.",
  );
}

// ============================================================================
// Container Names
// ============================================================================

export const CONTAINERS = {
  PROFILE_PICTURES: "profile-pictures",
  SOCIETY_MEDIA: "society-media",
  EVENT_MEDIA: "event-media",
  POST_ATTACHMENTS: "post-attachments",
  NOTE_ATTACHMENTS: "note-attachments",
} as const;

export type ContainerName = (typeof CONTAINERS)[keyof typeof CONTAINERS];

// ============================================================================
// Client Singleton
// ============================================================================

let _blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient {
  if (!_blobServiceClient) {
    if (!connectionString) {
      throw new Error(
        "AZURE_BLOB_CONNECTION_STRING is required. Set it in .env.local",
      );
    }
    _blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
  }
  return _blobServiceClient;
}

function getContainerClient(containerName: ContainerName): ContainerClient {
  return getBlobServiceClient().getContainerClient(containerName);
}

// ============================================================================
// Container Initialization
// ============================================================================

let _containersInitialized = false;

/**
 * Ensure all containers exist. Call once on app startup or first upload.
 * Containers are created with private access (no anonymous reads).
 */
export async function ensureContainersExist(): Promise<void> {
  if (_containersInitialized) return;

  const client = getBlobServiceClient();
  for (const containerName of Object.values(CONTAINERS)) {
    const container = client.getContainerClient(containerName);
    await container.createIfNotExists({
      // Private: files accessible only via backend-generated URLs
      access: undefined,
    });
  }
  _containersInitialized = true;
  console.log("Azure Blob containers initialized");
}

// ============================================================================
// Upload
// ============================================================================

export interface UploadResult {
  /** Full URL to the blob */
  url: string;
  /** Blob name (path within container) */
  blobName: string;
  /** Container name */
  container: ContainerName;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Upload a buffer to Azure Blob Storage.
 *
 * @param container  - Target container
 * @param blobName   - Path within container (e.g., "society-id/gallery/uuid.jpg")
 * @param buffer     - File content as Buffer
 * @param mimeType   - MIME type of the file
 * @param metadata   - Optional blob metadata (uploaded_by, entity_id, etc.)
 */
export async function uploadBlob(
  container: ContainerName,
  blobName: string,
  buffer: Buffer,
  mimeType: string,
  metadata?: Record<string, string>,
): Promise<UploadResult> {
  await ensureContainersExist();

  const containerClient = getContainerClient(container);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimeType,
      blobCacheControl: "public, max-age=31536000", // 1 year cache for immutable files
    },
    metadata: metadata || {},
  });

  const url = cdnBaseUrl
    ? `${cdnBaseUrl}/${container}/${blobName}`
    : blockBlobClient.url;

  return {
    url,
    blobName,
    container,
    sizeBytes: buffer.length,
  };
}

// ============================================================================
// Delete
// ============================================================================

/**
 * Soft-delete a blob (marks for deletion by Azure retention policy).
 * For actual hard-delete, the blob is removed permanently.
 */
export async function deleteBlob(
  container: ContainerName,
  blobName: string,
): Promise<boolean> {
  try {
    const containerClient = getContainerClient(container);
    const blobClient = containerClient.getBlobClient(blobName);
    await blobClient.deleteIfExists({ deleteSnapshots: "include" });
    return true;
  } catch (error) {
    console.error(`Failed to delete blob ${container}/${blobName}:`, error);
    return false;
  }
}

// ============================================================================
// Generate Read URL (for private containers)
// ============================================================================

/**
 * Generate a time-limited SAS URL for reading a private blob.
 * Use this when containers are set to private access.
 *
 * @param container - Container name
 * @param blobName  - Blob path within container
 * @param expiresInMinutes - How long the URL is valid (default: 60 min)
 */
export function generateReadUrl(
  container: ContainerName,
  blobName: string,
  expiresInMinutes: number = 60,
): string {
  if (!accountName || !accountKey) {
    // Fallback: return direct URL (works if container is public)
    const containerClient = getContainerClient(container);
    return containerClient.getBlockBlobClient(blobName).url;
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey,
  );

  // Start 5 minutes in the past to avoid clock-skew-related 403s.
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(startsOn.getTime() + expiresInMinutes * 60 * 1000);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName,
      permissions: BlobSASPermissions.parse("r"), // read only
      startsOn,
      expiresOn,
    },
    sharedKeyCredential,
  ).toString();

  const containerClient = getContainerClient(container);
  const blobUrl = containerClient.getBlockBlobClient(blobName).url;
  return `${blobUrl}?${sasToken}`;
}

// ============================================================================
// Utility: Extract blob name from URL
// ============================================================================

/**
 * Extract the blob name from a full Azure Blob URL.
 * E.g., "https://account.blob.core.windows.net/container/path/file.jpg"
 *   → "path/file.jpg"
 */
export function extractBlobName(
  fullUrl: string,
  container: ContainerName,
): string | null {
  try {
    const url = new URL(fullUrl);
    const pathParts = url.pathname.split("/");
    // pathname = /container/path/to/file.jpg
    const containerIndex = pathParts.indexOf(container);
    if (containerIndex === -1) return null;
    return pathParts.slice(containerIndex + 1).join("/");
  } catch {
    return null;
  }
}

// ============================================================================
// Utility: Resolve media URLs consistently (blob name OR full URL)
// ============================================================================

const CONTAINER_SET = new Set<ContainerName>(
  Object.values(CONTAINERS) as ContainerName[],
);

const configuredBlobHosts = new Set<string>();

if (accountName) {
  configuredBlobHosts.add(`${accountName}.blob.core.windows.net`.toLowerCase());
}

const blobEndpoint = getConnectionStringValue("BlobEndpoint");
if (blobEndpoint) {
  try {
    configuredBlobHosts.add(new URL(blobEndpoint).hostname.toLowerCase());
  } catch {
    // Ignore malformed BlobEndpoint and continue with known defaults.
  }
}

if (cdnBaseUrl) {
  try {
    configuredBlobHosts.add(new URL(cdnBaseUrl).hostname.toLowerCase());
  } catch {
    // Ignore malformed CDN URL and continue with known defaults.
  }
}

type ContainerHint = ContainerName | ContainerName[];

export interface ResolveMediaUrlOptions {
  container?: ContainerHint;
  expiresInMinutes?: number;
}

function normalizeContainerHints(hint?: ContainerHint): ContainerName[] {
  if (!hint) return [];
  const list = Array.isArray(hint) ? hint : [hint];
  return Array.from(
    new Set(list.filter((value): value is ContainerName => CONTAINER_SET.has(value))),
  );
}

function splitPathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment).trim();
      } catch {
        return segment.trim();
      }
    })
    .filter(Boolean);
}

function extractContainerAndBlobFromPath(
  pathname: string,
): { container: ContainerName; blobName: string } | null {
  const segments = splitPathSegments(pathname);
  if (!segments.length) return null;

  for (let i = 0; i < segments.length; i++) {
    const possibleContainer = segments[i];
    if (!CONTAINER_SET.has(possibleContainer as ContainerName)) continue;

    const blobName = segments.slice(i + 1).join("/");
    if (!blobName) return null;

    return {
      container: possibleContainer as ContainerName,
      blobName,
    };
  }

  return null;
}

function shouldTreatAsBlobHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (hostname.endsWith(".blob.core.windows.net")) return true;
  return configuredBlobHosts.has(hostname);
}

function normalizeBlobPath(raw: string): string {
  return raw.replace(/^\/+/, "").split("?")[0].split("#")[0].trim();
}

function resolveBlobTarget(
  raw: string,
  containerHints: ContainerName[],
): { container: ContainerName; blobName: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const asUrl = new URL(trimmed);
    const fromPath = extractContainerAndBlobFromPath(asUrl.pathname);

    if (shouldTreatAsBlobHost(asUrl)) {
      if (fromPath) {
        // If the URL itself provides container + blob path, trust it.
        return fromPath;
      }
      return null;
    }

    if (fromPath) {
      // Legacy app/proxy URLs can still carry a valid /{container}/{blobName} path.
      // Normalize these to fresh SAS-backed Azure URLs.
      return fromPath;
    }

    return null;
  } catch {
    // Not a URL - continue as a plain blob path.
  }

  const normalizedPath = normalizeBlobPath(trimmed);
  if (!normalizedPath) return null;

  const explicitContainerPath = extractContainerAndBlobFromPath(normalizedPath);
  if (explicitContainerPath) {
    // Explicit container in stored path wins over hints.
    return explicitContainerPath;
  }

  if (containerHints.length >= 1) {
    return { container: containerHints[0], blobName: normalizedPath };
  }

  return null;
}

export function resolveMediaUrl(
  input: unknown,
  options?: ResolveMediaUrlOptions,
): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }

  const expiresInMinutes = options?.expiresInMinutes ?? 24 * 60;
  const containerHints = normalizeContainerHints(options?.container);
  const target = resolveBlobTarget(raw, containerHints);

  if (target) {
    return generateReadUrl(target.container, target.blobName, expiresInMinutes);
  }

  return raw;
}

export function resolveMediaFields<T extends Record<string, unknown>>(
  row: T,
  fieldToContainerMap: Record<string, ContainerHint>,
  expiresInMinutes: number = 24 * 60,
): T {
  const resolved = { ...row } as T;

  for (const [field, containerHint] of Object.entries(fieldToContainerMap)) {
    if (!(field in resolved)) continue;

    const signed = resolveMediaUrl((resolved as Record<string, unknown>)[field], {
      container: containerHint,
      expiresInMinutes,
    });

    (resolved as Record<string, unknown>)[field] = signed;
  }

  return resolved;
}
