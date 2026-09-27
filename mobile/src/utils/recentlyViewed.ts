/**
 * Recently-viewed tournaments — persisted in SecureStore, max 5 entries.
 */
import { storage } from './storage';

const KEY      = 'tsb_recently_viewed';
const MAX_ITEMS = 5;

export interface RecentTournament {
  slug:      string;
  name:      string;
  sportKey:  string;
  status:    string;   // "registration" | "fixtures" | "live" | "completed"
  viewedAt:  number;   // Date.now()
}

async function load(): Promise<RecentTournament[]> {
  try {
    const raw = await storage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function save(items: RecentTournament[]): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(items));
}

export async function addRecentlyViewed(t: Omit<RecentTournament, 'viewedAt'>): Promise<void> {
  const items = await load();
  // Remove duplicate slug, prepend new entry, cap at MAX_ITEMS
  const filtered = items.filter(i => i.slug !== t.slug);
  const updated  = [{ ...t, viewedAt: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
  await save(updated);
}

export async function getRecentlyViewed(): Promise<RecentTournament[]> {
  return load();
}

export async function clearRecentlyViewed(): Promise<void> {
  await storage.deleteItem(KEY);
}
