# Media & Image Handling — Schema Design Document

## Overview

This document explains the **6 new tables** added to extend the existing database for image, media, and post handling. No existing tables were redesigned.

---

## Architecture Decision: Separate Tables (NOT Unified)

### Why separate tables instead of one `media` table?

| Factor | Unified Table | Separate Tables ✅ |
|---|---|---|
| **Permission control** | Complex WHERE clauses mixing society/event logic | Clean per-table policies. Society media → society roles. Event media → event roles. |
| **Query performance** | Every query filters by `entity_type` column on a massive table | Smaller, focused tables. Index scans are faster. |
| **Schema constraints** | Can't use partial unique indexes cleanly (e.g., "one logo per society") | UNIQUE constraints per table are clean and enforceable |
| **Migration safety** | One ALTER affects everything | Changes to event_media don't touch society_media |
| **Code clarity** | `media WHERE entity_type='EVENT' AND media_type='GALLERY'` | `event_media WHERE media_type='GALLERY'` |

**Verdict**: Separate tables are superior for this use case because society media and event media have different lifecycles, different permission models, and different constraints.

---

## Table Summary

| # | Table | Purpose | Parent FK |
|---|-------|---------|-----------|
| 1 | `society_media` | Society logo, cover, gallery images | `societies(id)` |
| 2 | `event_media` | Event gallery images, documents (PDFs) | `events(id)` |
| 3 | `posts` | Society/event announcements and updates | `societies(id)`, `events(id)` |
| 4 | `post_attachments` | Images/files attached to posts | `posts(id)` |
| 5 | `event_notes` | Internal organizer-only notes on events | `events(id)` |
| 6 | `event_note_attachments` | Files attached to event notes | `event_notes(id)` |

Plus: `thumbnail_url` column added to existing `events` table.

---

## Detailed Table Designs

### 1. `society_media`

Stores society-level images with strict cardinality rules.

```
society_media
├── id              UUID PK
├── society_id      UUID FK → societies(id) ON DELETE CASCADE
├── media_type      ENUM('LOGO', 'COVER', 'GALLERY')
├── file_url        TEXT NOT NULL
├── file_name       VARCHAR(500)
├── file_size_bytes BIGINT
├── mime_type       VARCHAR(100) NOT NULL  ← constrained to image types
├── caption         TEXT
├── display_order   INTEGER DEFAULT 0
├── uploaded_by     UUID FK → users(id)
├── is_deleted      BOOLEAN DEFAULT FALSE
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ
```

**Key constraints:**
- `UNIQUE(society_id) WHERE media_type='LOGO' AND is_deleted=FALSE` → max 1 active logo
- `UNIQUE(society_id) WHERE media_type='COVER' AND is_deleted=FALSE` → max 1 active cover
- GALLERY type has no limit (unlimited images)
- Only image MIME types allowed (jpg, png, gif, webp, svg)

**Relationship to `societies.logo_url`**: The existing `logo_url` column on societies remains for backward compatibility. New uploads should go through `society_media` with type `LOGO`. Optionally sync `societies.logo_url` via application logic.

---

### 2. `event_media`

Stores event gallery images and documents. Thumbnail and banner remain on the `events` table directly (1:1 fields for fast listing queries).

```
event_media
├── id              UUID PK
├── event_id        UUID FK → events(id) ON DELETE CASCADE
├── media_type      ENUM('GALLERY', 'DOCUMENT')
├── file_url        TEXT NOT NULL
├── file_name       VARCHAR(500)
├── file_size_bytes BIGINT
├── mime_type       VARCHAR(100) NOT NULL  ← constrained by type
├── caption         TEXT
├── display_order   INTEGER DEFAULT 0
├── uploaded_by     UUID FK → users(id)
├── is_deleted      BOOLEAN DEFAULT FALSE
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ
```

**Key constraints:**
- GALLERY → only image MIME types
- DOCUMENT → PDF, DOC, DOCX, and images
- No cardinality limit (unlimited gallery/docs per event)

**Why thumbnail & banner are NOT here:**
- Thumbnail (1:1, required) → `events.thumbnail_url`
- Banner (1:1, optional) → `events.banner_url` (already exists)
- Keeping them on the events table avoids JOINs when listing events

---

### 3. `posts`

Society or event posts (announcements, updates, recaps).

```
posts
├── id              UUID PK
├── society_id      UUID FK → societies(id) ON DELETE CASCADE
├── event_id        UUID FK → events(id) ON DELETE CASCADE  ← nullable
├── author_id       UUID FK → users(id)
├── title           VARCHAR(500)
├── body            TEXT NOT NULL
├── visibility      ENUM('PUBLIC', 'MEMBERS_ONLY')
├── is_pinned       BOOLEAN DEFAULT FALSE
├── is_deleted      BOOLEAN DEFAULT FALSE
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ
```

**Key behaviors:**
- `event_id = NULL` → society-wide post
- `event_id = <uuid>` → event-specific post
- Trigger validates that `event.society_id` matches `post.society_id`
- Feed ordering: pinned first, then by created_at DESC

---

### 4. `post_attachments`

Multiple images/files per post.

```
post_attachments
├── id              UUID PK
├── post_id         UUID FK → posts(id) ON DELETE CASCADE
├── file_url        TEXT NOT NULL
├── file_name       VARCHAR(500)
├── file_size_bytes BIGINT
├── mime_type       VARCHAR(100) NOT NULL  ← images + PDF
├── caption         TEXT
├── display_order   INTEGER DEFAULT 0
├── uploaded_by     UUID FK → users(id)
├── is_deleted      BOOLEAN DEFAULT FALSE
└── created_at      TIMESTAMPTZ
```

---

### 5. `event_notes` (Internal / Organizer-Only)

Private notes visible only to event organizers. NOT public-facing.

```
event_notes
├── id              UUID PK
├── event_id        UUID FK → events(id) ON DELETE CASCADE
├── author_id       UUID FK → users(id)
├── title           VARCHAR(500)
├── body            TEXT NOT NULL
├── is_deleted      BOOLEAN DEFAULT FALSE
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ
```

---

### 6. `event_note_attachments`

Files attached to organizer notes.

```
event_note_attachments
├── id              UUID PK
├── note_id         UUID FK → event_notes(id) ON DELETE CASCADE
├── file_url        TEXT NOT NULL
├── file_name       VARCHAR(500)
├── file_size_bytes BIGINT
├── mime_type       VARCHAR(100) NOT NULL  ← images + PDF + DOC
├── uploaded_by     UUID FK → users(id)
├── is_deleted      BOOLEAN DEFAULT FALSE
└── created_at      TIMESTAMPTZ
```

---

## ER Relationships

```
societies ──1:N──→ society_media     (logo, cover, gallery)
societies ──1:N──→ posts             (society-wide posts)

events ──1:N──→ event_media          (gallery, documents)
events ──1:N──→ posts                (event-specific posts)
events ──1:N──→ event_notes          (internal organizer notes)

posts ──1:N──→ post_attachments      (images, PDFs on posts)
event_notes ──1:N──→ event_note_attachments (files on notes)

users ──→ uploaded_by (on all media/attachment tables)
users ──→ author_id (on posts, event_notes)
```

---

## Permission Matrix

| Role | Society Media | Event Media | Posts | Event Notes |
|------|:---:|:---:|:---:|:---:|
| **SuperAdmin** | Full CRUD | Full CRUD | Full CRUD | Full CRUD |
| **President** | Full CRUD | Full CRUD | Full CRUD | Full CRUD |
| **Vice President** | Upload/Edit | Upload/Edit | Create/Edit | Create/Edit/View |
| **Director** | Upload | Upload | Create | Create/View |
| **Deputy Director** | Upload | Upload | — | View |
| **Member** | View only | View only | View only | ❌ No access |

### New Privileges Added

| Privilege | Description |
|-----------|-------------|
| `CREATE_POST` | Create society/event posts |
| `EDIT_POST` | Edit existing posts |
| `DELETE_POST` | Soft-delete posts |
| `UPLOAD_MEDIA` | Upload media to events/societies |
| `DELETE_MEDIA` | Soft-delete media files |
| `CREATE_EVENT_NOTE` | Create internal event notes |
| `EDIT_EVENT_NOTE` | Edit internal event notes |
| `DELETE_EVENT_NOTE` | Soft-delete event notes |
| `VIEW_EVENT_NOTES` | View internal notes (organizers only) |

---

## Indexing Strategy

### Pattern: Filtered Indexes for Soft Delete

Every table uses `is_deleted = FALSE` filtered indexes to keep queries fast without scanning deleted rows.

### Per-Table Index Summary

| Table | Index | Purpose |
|-------|-------|---------|
| `society_media` | `(society_id)` | List media for a society |
| `society_media` | `(society_id, media_type) WHERE !deleted` | Filter by type |
| `society_media` | `UNIQUE(society_id) WHERE LOGO AND !deleted` | Enforce 1 logo |
| `society_media` | `UNIQUE(society_id) WHERE COVER AND !deleted` | Enforce 1 cover |
| `society_media` | `(society_id, display_order) WHERE GALLERY AND !deleted` | Ordered gallery |
| `event_media` | `(event_id)` | List media for an event |
| `event_media` | `(event_id, media_type) WHERE !deleted` | Filter by type |
| `event_media` | `(event_id, display_order) WHERE GALLERY AND !deleted` | Ordered gallery |
| `posts` | `(society_id, is_pinned DESC, created_at DESC) WHERE !deleted` | Society feed |
| `posts` | `(event_id, created_at DESC) WHERE !deleted` | Event post feed |
| `post_attachments` | `(post_id, display_order) WHERE !deleted` | Ordered attachments |
| `event_notes` | `(event_id, created_at DESC) WHERE !deleted` | Notes timeline |
| `event_note_attachments` | `(note_id) WHERE !deleted` | Note files |

---

## Security Constraints Summary

1. **File URL only in DB** — No binary data stored. Only `file_url` paths/URLs.
2. **`uploaded_by`** — Every file tracks who uploaded it.
3. **`created_at`** — Every file tracks when it was uploaded.
4. **`is_deleted` soft delete** — Files are never hard-deleted via normal operations.
5. **MIME type CHECK constraints** — DB-level enforcement of allowed file types.
6. **File size limit** — `file_size_bytes` stored for auditing; actual limit enforced in backend middleware.
7. **CASCADE deletes** — If a society/event is hard-deleted, all related media is removed.

---

## How to Run

```bash
# After running the main schema files:
psql -h <host> -U <user> -d event_management -f schema-media.sql
```

Or via Node.js:
```bash
node -e "
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({ /* your config */ });
const sql = fs.readFileSync('schema-media.sql', 'utf8');
pool.query(sql).then(() => console.log('Done')).catch(console.error).finally(() => pool.end());
"
```

---

## What Was NOT Changed

- `users` table — `avatar_url` already handles profile pictures (1:1, replace-on-upload)
- `events` table — `banner_url` already exists (only added `thumbnail_url`)
- `content` table — Left intact for generic society/wing/portfolio file uploads
- `societies` table — `logo_url` left intact for backward compatibility
- All existing indexes, triggers, views — Untouched
