import { ProjectData } from '@/types/project';

const DB_NAME = 'MindplicitStudioDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let dbDisabled = false;

// In-memory fallbacks if IndexedDB is blocked in sandboxed iframes
const memoryProjects = new Map<string, ProjectData>();
const memoryAudio = new Map<string, { blob: Blob; duration: number; voice: string }>();
const memoryImages = new Map<string, Blob | File>();

export async function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || dbDisabled) {
    return null;
  }

  if (dbInstance) return dbInstance;

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('audio_cache')) {
            db.createObjectStore('audio_cache', { keyPath: 'scene_id' });
          }
          if (!db.objectStoreNames.contains('image_cache')) {
            db.createObjectStore('image_cache', { keyPath: 'filename' });
          }
          if (!db.objectStoreNames.contains('ai_analyses')) {
            db.createObjectStore('ai_analyses', { keyPath: 'id' });
          }
        } catch {
          // ignore
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        dbDisabled = true;
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      dbDisabled = true;
      resolve(null);
    }
  });
}

// Project storage
export async function saveProjectToDB(project: ProjectData): Promise<void> {
  const id = project.id || 'default_project';
  const dataToSave = {
    ...project,
    id,
    updated_at: new Date().toISOString(),
  };

  memoryProjects.set(id, dataToSave);

  try {
    const db = await getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        const req = store.put(dataToSave);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // fallback to memory
  }
}

export async function getProjectFromDB(id: string = 'default_project'): Promise<ProjectData | null> {
  try {
    const db = await getDB();
    if (!db) {
      return memoryProjects.get(id) || null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('projects', 'readonly');
        const store = tx.objectStore('projects');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || memoryProjects.get(id) || null);
        req.onerror = () => resolve(memoryProjects.get(id) || null);
      } catch {
        resolve(memoryProjects.get(id) || null);
      }
    });
  } catch {
    return memoryProjects.get(id) || null;
  }
}

export async function listProjectsFromDB(): Promise<ProjectData[]> {
  try {
    const db = await getDB();
    if (!db) {
      return Array.from(memoryProjects.values());
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('projects', 'readonly');
        const store = tx.objectStore('projects');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || Array.from(memoryProjects.values()));
        req.onerror = () => resolve(Array.from(memoryProjects.values()));
      } catch {
        resolve(Array.from(memoryProjects.values()));
      }
    });
  } catch {
    return Array.from(memoryProjects.values());
  }
}

// Audio cache
export async function saveAudioToDB(sceneId: string, blob: Blob, duration: number, voice: string): Promise<void> {
  const record = {
    scene_id: sceneId,
    blob,
    duration,
    voice,
    saved_at: new Date().toISOString(),
  };

  memoryAudio.set(sceneId, record);

  try {
    const db = await getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('audio_cache', 'readwrite');
        const store = tx.objectStore('audio_cache');
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // memory fallback already saved
  }
}

export async function getAudioFromDB(sceneId: string): Promise<{ blob: Blob; duration: number; voice: string } | null> {
  try {
    const db = await getDB();
    if (!db) {
      return memoryAudio.get(sceneId) || null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('audio_cache', 'readonly');
        const store = tx.objectStore('audio_cache');
        const req = store.get(sceneId);
        req.onsuccess = () => resolve(req.result || memoryAudio.get(sceneId) || null);
        req.onerror = () => resolve(memoryAudio.get(sceneId) || null);
      } catch {
        resolve(memoryAudio.get(sceneId) || null);
      }
    });
  } catch {
    return memoryAudio.get(sceneId) || null;
  }
}

export async function getAllAudioFromDB(): Promise<Map<string, { url: string; duration: number }>> {
  const map = new Map<string, { url: string; duration: number }>();

  // Add memory items first
  memoryAudio.forEach((val, key) => {
    try {
      map.set(key, { url: URL.createObjectURL(val.blob), duration: val.duration });
    } catch {}
  });

  try {
    const db = await getDB();
    if (!db) return map;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('audio_cache', 'readonly');
        const store = tx.objectStore('audio_cache');
        const req = store.getAll();
        req.onsuccess = () => {
          const records = req.result || [];
          for (const rec of records) {
            if (rec.blob) {
              try {
                const url = URL.createObjectURL(rec.blob);
                map.set(rec.scene_id, { url, duration: rec.duration || 0 });
              } catch {}
            }
          }
          resolve(map);
        };
        req.onerror = () => resolve(map);
      } catch {
        resolve(map);
      }
    });
  } catch {
    return map;
  }
}

// Image cache
export async function saveImageToDB(filename: string, file: Blob | File): Promise<string> {
  memoryImages.set(filename, file);
  let url = '';
  try {
    url = URL.createObjectURL(file);
  } catch {
    url = '';
  }

  try {
    const db = await getDB();
    if (!db) return url;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('image_cache', 'readwrite');
        const store = tx.objectStore('image_cache');
        const record = {
          filename,
          blob: file,
          saved_at: new Date().toISOString(),
        };
        const req = store.put(record);
        req.onsuccess = () => resolve(url);
        req.onerror = () => resolve(url);
      } catch {
        resolve(url);
      }
    });
  } catch {
    return url;
  }
}

export async function getImageFromDB(filename: string): Promise<string | null> {
  if (memoryImages.has(filename)) {
    try {
      return URL.createObjectURL(memoryImages.get(filename)!);
    } catch {
      return null;
    }
  }

  try {
    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('image_cache', 'readonly');
        const store = tx.objectStore('image_cache');
        const req = store.get(filename);
        req.onsuccess = () => {
          if (req.result && req.result.blob) {
            try {
              resolve(URL.createObjectURL(req.result.blob));
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function getAllImagesFromDB(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  memoryImages.forEach((val, key) => {
    try {
      map.set(key, URL.createObjectURL(val));
    } catch {}
  });

  try {
    const db = await getDB();
    if (!db) return map;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('image_cache', 'readonly');
        const store = tx.objectStore('image_cache');
        const req = store.getAll();
        req.onsuccess = () => {
          const records = req.result || [];
          for (const rec of records) {
            if (rec.blob) {
              try {
                map.set(rec.filename, URL.createObjectURL(rec.blob));
              } catch {}
            }
          }
          resolve(map);
        };
        req.onerror = () => resolve(map);
      } catch {
        resolve(map);
      }
    });
  } catch {
    return map;
  }
}

// Storage estimate
export async function getStorageEstimate(): Promise<{ usage: number; quota: number; formatted: string }> {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const mbUsage = (usage / (1024 * 1024)).toFixed(1);
      const mbQuota = (quota / (1024 * 1024)).toFixed(0);
      return { usage, quota, formatted: `${mbUsage} ميجابايت من ${mbQuota} ميجابايت` };
    } catch {
      // fallback
    }
  }
  return { usage: 0, quota: 0, formatted: 'ذاكرة نشطة' };
}
