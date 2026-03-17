/**
 * Offline ticket cache using IndexedDB.
 *
 * Stores ticket data + QR payloads in IndexedDB for offline access.
 * Also stores pre-rendered QR images as data URLs.
 *
 * Usage:
 *   - Call `cacheTicket(ticket)` when a ticket detail is viewed online
 *   - Call `getCachedTicket(id)` to retrieve a ticket when offline
 *   - Call `getCachedTickets()` to get all cached tickets
 *   - Call `removeExpiredTickets()` to clean up old entries
 */

const DB_NAME = 'nust-events-offline';
const DB_VERSION = 1;
const TICKET_STORE = 'tickets';

export interface CachedTicket {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  event_venue: string;
  event_banner_url?: string;
  society_name: string;
  ticket_number: string;
  status: string;
  qr_data: string;
  qr_image_data_url?: string;  // Pre-rendered QR as data URL
  attendee_name: string;
  attendee_email: string;
  cached_at: number;  // timestamp
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TICKET_STORE)) {
        const store = db.createObjectStore(TICKET_STORE, { keyPath: 'id' });
        store.createIndex('event_id', 'event_id', { unique: false });
        store.createIndex('cached_at', 'cached_at', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Cache a ticket for offline access.
 */
export async function cacheTicket(ticket: CachedTicket): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(TICKET_STORE, 'readwrite');
    const store = tx.objectStore(TICKET_STORE);

    store.put({
      ...ticket,
      cached_at: Date.now(),
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('[TicketCache] Failed to cache ticket:', err);
  }
}

/**
 * Retrieve a cached ticket by ID.
 */
export async function getCachedTicket(id: string): Promise<CachedTicket | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(TICKET_STORE, 'readonly');
    const store = tx.objectStore(TICKET_STORE);
    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Get all cached tickets, sorted by event date descending.
 */
export async function getCachedTickets(): Promise<CachedTicket[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(TICKET_STORE, 'readonly');
    const store = tx.objectStore(TICKET_STORE);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        const tickets = request.result || [];
        // Sort by event date descending
        tickets.sort((a: CachedTicket, b: CachedTicket) =>
          new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
        );
        resolve(tickets);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    return [];
  }
}

/**
 * Remove tickets for events older than 30 days.
 */
export async function removeExpiredTickets(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(TICKET_STORE, 'readwrite');
    const store = tx.objectStore(TICKET_STORE);
    const allRequest = store.getAll();

    allRequest.onsuccess = () => {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
      for (const ticket of allRequest.result) {
        const eventDate = new Date(ticket.event_date).getTime();
        if (eventDate < cutoff) {
          store.delete(ticket.id);
        }
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.warn('[TicketCache] Failed to remove expired tickets:', err);
  }
}

/**
 * Get the count of cached tickets.
 */
export async function getCachedTicketCount(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(TICKET_STORE, 'readonly');
    const store = tx.objectStore(TICKET_STORE);
    const countRequest = store.count();

    return new Promise((resolve, reject) => {
      countRequest.onsuccess = () => { db.close(); resolve(countRequest.result); };
      countRequest.onerror = () => { db.close(); reject(countRequest.error); };
    });
  } catch {
    return 0;
  }
}

/**
 * Check if we're currently offline.
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}