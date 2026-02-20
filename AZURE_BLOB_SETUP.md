# Azure Blob Storage Setup Guide

## Step 1: Create a Storage Account in Azure Portal

1. Go to **Azure Portal** → https://portal.azure.com
2. Click **"+ Create a resource"**
3. Search for **"Storage account"** → Click **Create**
4. Fill in:

| Field | Value |
|-------|-------|
| **Subscription** | Azure for Students |
| **Resource Group** | Use existing (same as your PostgreSQL) or create new: `nust-eventmgmt-rg` |
| **Storage account name** | `nusteventmgmtblob` (lowercase, no hyphens, globally unique) |
| **Region** | Same as your PostgreSQL (e.g., East US) |
| **Performance** | Standard |
| **Redundancy** | LRS (Locally-redundant storage) — cheapest, fine for student tier |

5. Click **Review + Create** → **Create**
6. Wait for deployment to complete (1-2 minutes)

## Step 2: Get Connection String

1. Go to your new Storage Account
2. Left menu → **Security + networking** → **Access keys**
3. Click **Show** on Key 1
4. Copy:
   - **Storage account name** → (e.g., `nusteventmgmtblob`)
   - **Key** → (long Base64 string)
   - **Connection string** → (starts with `DefaultEndpointsProtocol=https;...`)

## Step 3: Update `.env.local`

Open `.env.local` and replace the placeholder values:

```env
# Azure Blob Storage
AZURE_BLOB_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=nusteventmgmtblob;AccountKey=YOUR_KEY_HERE;EndpointSuffix=core.windows.net
AZURE_BLOB_ACCOUNT_NAME=nusteventmgmtblob
AZURE_BLOB_ACCOUNT_KEY=YOUR_KEY_HERE
AZURE_BLOB_CDN_URL=
```

Replace `nusteventmgmtblob` with your actual account name and `YOUR_KEY_HERE` with the actual key from Step 2.

## Step 4: Run Database Migrations

The media tables and storage quota tracking need to be created:

```bash
# Run these SQL files in order against your Azure PostgreSQL:
# 1. schema-media.sql     (media tables, posts, notes)
# 2. schema-storage-quota.sql  (storage quota tracking, upload logs)

# Using psql:
psql "host=eventmgmt-pg-server.postgres.database.azure.com port=5432 dbname=event_management user=pgadmin password=YOUR_PASSWORD sslmode=require" -f schema-media.sql
psql "host=eventmgmt-pg-server.postgres.database.azure.com port=5432 dbname=event_management user=pgadmin password=YOUR_PASSWORD sslmode=require" -f schema-storage-quota.sql
```

Or use the test script below.

## Step 5: Test the Connection

```bash
node test-blob-connection.js
```

This will:
- Connect to Azure Blob Storage
- Create all required containers
- Upload a test file
- Delete the test file
- Verify everything works

## Step 6: Verify Containers Created

Go to Azure Portal → Storage Account → **Data storage** → **Containers**

You should see 5 containers:
- `profile-pictures`
- `society-media`
- `event-media`
- `post-attachments`
- `note-attachments`

All set to **Private** access (no anonymous reads).

---

## Architecture Overview

```
Frontend (browser)
    │
    │ POST /api/upload/profile-picture  (FormData: file)
    │ POST /api/upload/event-media      (FormData: file, ?eventId, ?type)
    │ POST /api/upload/society-media    (FormData: file, ?societyId, ?type)
    │ POST /api/upload/post-attachment  (FormData: file, ?postId)
    │ POST /api/upload/note-attachment  (FormData: file, ?noteId)
    │
    ▼
Next.js API Route (server)
    │
    ├── 1. Auth check (JWT cookie)
    ├── 2. Rate limit check (10/min, 60/hr, 100MB/hr)
    ├── 3. File validation (MIME, extension, magic bytes, size)
    ├── 4. Permission check (RBAC via fn_has_privilege)
    ├── 5. Count limit check (100 gallery, 20 attachments)
    ├── 6. Society quota check (500MB default)
    ├── 7. Image processing (resize ≤1920px, compress, strip EXIF)
    │
    ▼
Azure Blob Storage
    │
    └── Returns URL → stored in PostgreSQL (NOT the file itself)
```

---

## File Limits Summary

| Type | Max Size | Max Dimension | Format |
|------|----------|---------------|--------|
| Profile picture | 8 MB | 1920×1920px | JPG/PNG/GIF/WebP |
| Event thumbnail | 8 MB | 1920×1920px | JPG/PNG/GIF/WebP |
| Event banner | 8 MB | 1920×1920px | JPG/PNG/GIF/WebP |
| Gallery image | 8 MB | 1920×1920px | JPG/PNG/GIF/WebP |
| Document/PDF | 15 MB | — | PDF/DOC/DOCX |

## Count Limits

| Entity | Limit |
|--------|-------|
| Event gallery images | 100 per event |
| Post attachments | 20 per post |
| Note attachments | 20 per note |
| Society gallery images | 200 per society |
| Society logo | 1 active |
| Society cover | 1 active |

## Rate Limits

| Limit | Value |
|-------|-------|
| Uploads per minute per user | 10 |
| Uploads per hour per user | 60 |
| Total upload size per hour per user | 100 MB |
| Society storage quota (default) | 500 MB |

---

## Cost Estimate (Azure Student Tier)

Azure for Students gives $100 credit. Azure Blob Storage costs:

| Item | Cost |
|------|------|
| Storage (LRS, Hot) | ~$0.018/GB/month |
| Write operations | ~$0.05 per 10,000 writes |
| Read operations | ~$0.004 per 10,000 reads |

**Estimated monthly cost for 5,000 students:**
- ~50GB storage × $0.018 = **$0.90/month**
- ~100K write ops = **$0.50/month**
- ~500K read ops = **$0.20/month**
- **Total: ~$1.60/month** (well within $100 credit)

Even at 10K students with 200GB: **~$5/month**.

---

## Security Checklist

- [x] Containers set to PRIVATE (no anonymous access)
- [x] Connection string in `.env.local` (gitignored)
- [x] MIME type validated server-side
- [x] File extension validated against MIME type
- [x] Magic bytes validated (prevents MIME spoofing)
- [x] File size enforced before processing
- [x] Images auto-resized to max 1920px
- [x] EXIF data stripped from images (privacy)
- [x] Upload rate limiting per user
- [x] Storage quota per society
- [x] `uploaded_by` tracked on every file
- [x] Soft delete (`is_deleted`) for audit trail
- [x] RBAC permission checks on all uploads
