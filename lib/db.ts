import { ProjectData } from '@/types/project';

const DB_NAME = 'MindplicitStudioDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in browser environment');
  }

  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
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
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Project storage
export async function saveProjectToDB(project: ProjectData): Promise<void> {
  const db = await getDB();
  const id = project.id || 'default_project';
  const dataToSave = {
    ...project,
    id,
    updated_at: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const req = store.put(dataToSave);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getProjectFromDB(id: string = 'default_project'): Promise<ProjectData | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listProjectsFromDB(): Promise<ProjectData[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Audio cache
export async function saveAudioToDB(sceneId: string, blob: Blob, duration: number, voice: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_cache', 'readwrite');
    const store = tx.objectStore('audio_cache');
    const record = {
      scene_id: sceneId,
      blob,
      duration,
      voice,
      saved_at: new Date().toISOString(),
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioFromDB(sceneId: string): Promise<{ blob: Blob; duration: number; voice: string } | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_cache', 'readonly');
    const store = tx.objectStore('audio_cache');
    const req = store.get(sceneId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllAudioFromDB(): Promise<Map<string, { url: string; duration: number }>> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_cache', 'readonly');
    const store = tx.objectStore('audio_cache');
    const req = store.getAll();
    req.onsuccess = () => {
      const map = new Map<string, { url: string; duration: number }>();
      const records = req.result || [];
      for (const rec of records) {
        if (rec.blob) {
          const url = URL.createObjectURL(rec.blob);
          map.set(rec.scene_id, { url, duration: rec.duration || 0 });
        }
      }
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

// Image cache
export async function saveImageToDB(filename: string, file: Blob | File): Promise<string> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('image_cache', 'readwrite');
    const store = tx.objectStore('image_cache');
    const record = {
      filename,
      blob: file,
      saved_at: new Date().toISOString(),
    };
    const req = store.put(record);
    req.onsuccess = () => {
      const url = URL.createObjectURL(file);
      resolve(url);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getImageFromDB(filename: string): Promise<string | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('image_cache', 'readonly');
    const store = tx.objectStore('image_cache');
    const req = store.get(filename);
    req.onsuccess = () => {
      if (req.result && req.result.blob) {
        resolve(URL.createObjectURL(req.result.blob));
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllImagesFromDB(): Promise<Map<string, string>> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('image_cache', 'readonly');
    const store = tx.objectStore('image_cache');
    const req = store.getAll();
    req.onsuccess = () => {
      const map = new Map<string, string>();
      const records = req.result || [];
      for (const rec of records) {
        if (rec.blob) {
          map.set(rec.filename, URL.createObjectURL(rec.blob));
        }
      }
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

// Estimate storage
export async function getStorageEstimate(): Promise<{ usage: number; quota: number; formatted: string }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const mbUsage = (usage / (1024 * 1024)).toFixed(1);
      const mbQuota = (quota / (1024 * 1024)).toFixed(0);
      return { usage, quota, formatted: `${mbUsage} ميجابايت من ${mbQuota} ميجابايت` };
    } catch {
      // fallback
    }
  }
  return { usage: 0, quota: 0, formatted: 'متوفر' };
}
