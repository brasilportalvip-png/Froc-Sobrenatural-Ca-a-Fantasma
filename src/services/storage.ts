import { Session, EvidenceItem, BlindTestItem } from '../types';

const DB_NAME = 'froc_paranormal_db';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('evidence')) {
        const store = db.createObjectStore('evidence', { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('audio_blobs')) {
        db.createObjectStore('audio_blobs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('blind_tests')) {
        const store = db.createObjectStore('blind_tests', { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(session: Session): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSessions(): Promise<Session[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const req = tx.objectStore('sessions').getAll();
    req.onsuccess = () => {
      const list = req.result as Session[];
      list.sort((a, b) => b.startTime - a.startTime);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sessions', 'evidence', 'audio_blobs', 'blind_tests'], 'readwrite');
    tx.objectStore('sessions').delete(sessionId);

    // Delete related evidence
    const evIndex = tx.objectStore('evidence').index('sessionId');
    const evReq = evIndex.openCursor(IDBKeyRange.only(sessionId));
    evReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        if (cursor.value.audioId) {
          tx.objectStore('audio_blobs').delete(cursor.value.audioId);
        }
        cursor.delete();
        cursor.continue();
      }
    };

    // Delete related blind tests
    const btIndex = tx.objectStore('blind_tests').index('sessionId');
    const btReq = btIndex.openCursor(IDBKeyRange.only(sessionId));
    btReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveEvidenceItem(item: EvidenceItem, audioBlob?: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const stores = audioBlob ? ['evidence', 'audio_blobs'] : ['evidence'];
    const tx = db.transaction(stores, 'readwrite');
    
    if (audioBlob && item.audioId) {
      tx.objectStore('audio_blobs').put({ id: item.audioId, blob: audioBlob });
    }
    tx.objectStore('evidence').put(item);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSessionEvidence(sessionId: string): Promise<EvidenceItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('evidence', 'readonly');
    const index = tx.objectStore('evidence').index('sessionId');
    const req = index.getAll(IDBKeyRange.only(sessionId));
    req.onsuccess = () => {
      const items = req.result as EvidenceItem[];
      items.sort((a, b) => a.timestamp - b.timestamp);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioBlob(audioId: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_blobs', 'readonly');
    const req = tx.objectStore('audio_blobs').get(audioId);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBlindTest(test: BlindTestItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blind_tests', 'readwrite');
    tx.objectStore('blind_tests').put(test);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSessionBlindTests(sessionId: string): Promise<BlindTestItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blind_tests', 'readonly');
    const index = tx.objectStore('blind_tests').index('sessionId');
    const req = index.getAll(IDBKeyRange.only(sessionId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getStorageStats(): Promise<{ sessionCount: number; evidenceCount: number; approxBytes: number }> {
  try {
    const sessions = await loadSessions();
    const db = await openDB();
    const evCount = await new Promise<number>((res) => {
      const tx = db.transaction('evidence', 'readonly');
      const req = tx.objectStore('evidence').count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(0);
    });

    let approxBytes = 0;
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      approxBytes = est.usage || 0;
    }

    return {
      sessionCount: sessions.length,
      evidenceCount: evCount,
      approxBytes,
    };
  } catch {
    return { sessionCount: 0, evidenceCount: 0, approxBytes: 0 };
  }
}
