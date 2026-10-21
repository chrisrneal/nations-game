/**
 * Saves that survive (decision record K13). Profiles and games live in
 * IndexedDB. A browser may clear a site's storage when the phone runs low on
 * space, and Safari clears it for a site not used for a week unless the app is
 * on the Home Screen. Asking for "persistent" storage tells the browser not to:
 * Chrome grants it to an installed app, Safari to a Home Screen app.
 */
export interface StorageLike {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

function browserStorage(): StorageLike | undefined {
  const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
  return s !== undefined && typeof s.persist === 'function' && typeof s.persisted === 'function' ? s : undefined;
}

/** Asks the browser to keep the saves. True: it will. False: it may clear them. Null: this browser cannot say. */
export async function protectSaves(storage: StorageLike | undefined = browserStorage()): Promise<boolean | null> {
  if (storage === undefined) return null;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return null;
  }
}

/** Whether the saves are protected right now, without asking again. */
export async function savesProtected(storage: StorageLike | undefined = browserStorage()): Promise<boolean | null> {
  if (storage === undefined) return null;
  try {
    return await storage.persisted();
  } catch {
    return null;
  }
}
