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
