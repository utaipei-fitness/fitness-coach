// 「我的影片」：自選影片跟練的影片與分析結果，存在這台裝置的瀏覽器資料庫（IndexedDB）。
// 不會上傳到任何地方；換裝置或清除瀏覽器資料就會消失。
import type { ReferenceFile } from '../reference/reference-data';

export interface SavedVideo {
  id: string;
  name: string;
  /** 建立時間（ISO 字串） */
  createdAt: string;
  durationSec: number;
  /** 分析結果（示範者骨架） */
  analysis: ReferenceFile;
  /** 影片本身；裝置空間不夠存不下時為 undefined，練習前要重新選檔案 */
  video?: Blob;
  /** 原始檔案大小（位元組），重新選檔案時用來確認是同一支 */
  fileSize: number;
}

const DB_NAME = 'fitness-coach';
const STORE = 'videos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('這個瀏覽器不能儲存影片'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('無法開啟瀏覽器資料庫'));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => (db.close(), resolve(req.result));
        tx.onerror = tx.onabort = () => (db.close(), reject(tx.error ?? req.error ?? new Error('儲存失敗')));
      }),
  );
}

/**
 * 列出已存的影片（新的在前）。回傳完整資料：影片是 Blob（只是指向瀏覽器裡的檔案，不會整支讀進記憶體），
 * 這樣按「跟練」時可以在點擊當下就建立影片播放器（iPhone 播放聲音的規定）。
 */
export async function listVideos(): Promise<SavedVideo[]> {
  try {
    const all = await run<SavedVideo[]>('readonly', (s) => s.getAll() as IDBRequest<SavedVideo[]>);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function getVideo(id: string): Promise<SavedVideo | undefined> {
  return run<SavedVideo | undefined>('readonly', (s) => s.get(id) as IDBRequest<SavedVideo | undefined>);
}

/**
 * 儲存影片與分析結果。空間不夠時改成只存分析結果（之後練習要重新選同一支影片）。
 * @returns 影片本身是否有存下來
 */
export async function saveVideo(v: SavedVideo): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(v));
    return v.video !== undefined;
  } catch {
    const { video: _v, ...withoutVideo } = v;
    await run('readwrite', (s) => s.put(withoutVideo));
    return false;
  }
}

export function deleteVideo(id: string): Promise<undefined> {
  return run('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

export function newVideoId(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
