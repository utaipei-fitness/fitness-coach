// 影像來源：鏡頭或影片檔。兩者都提供一個 <video>，後面的處理流程不用分辨來源。
// 注意：<video> 要先放進畫面再呼叫 playVideo()，否則瀏覽器可能為了省電把它暫停。
import type { Settings } from '../config/schema';

export interface VideoSource {
  video: HTMLVideoElement;
  kind: 'camera' | 'file';
  /** 顯示用的名稱，例如「前鏡頭」或影片檔名 */
  label: string;
  stop(): void;
}

function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  // iPhone 需要這三個屬性才能在頁面內自動播放
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  return video;
}

async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('影片無法讀取，可能是格式不支援（建議用 mp4）')), { once: true });
  });
}

/** 開始播放（<video> 已放進畫面之後呼叫）。被瀏覽器擋下時丟出中文錯誤。 */
export async function playVideo(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch (err) {
    throw new Error(`影像無法自動播放，請點一下畫面。（${err instanceof Error ? err.message : String(err)}）`);
  }
}

export async function openCamera(camera: Settings['camera']): Promise<VideoSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      window.isSecureContext
        ? '這個瀏覽器不支援開啟鏡頭，請改用 Safari（iPhone）或 Chrome。'
        : '需要 HTTPS 才能開啟鏡頭。用手機測試時，請開啟 npm run dev:phone 顯示的 https 網址。',
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: camera.facingMode,
        width: { ideal: camera.width },
        height: { ideal: camera.height },
      },
    });
  } catch (err) {
    throw new Error(cameraErrorText(err));
  }

  const video = createVideoElement();
  video.srcObject = stream;
  try {
    await waitForMetadata(video);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
  return {
    video,
    kind: 'camera',
    label: camera.facingMode === 'user' ? '前鏡頭' : '後鏡頭',
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

export async function openVideoFile(file: File): Promise<VideoSource> {
  const url = URL.createObjectURL(file);
  const video = createVideoElement();
  video.loop = true;
  video.src = url;
  try {
    await waitForMetadata(video);
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return {
    video,
    kind: 'file',
    label: file.name,
    stop: () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}

/**
 * 影片每出現新的一幀就呼叫 cb 一次（同一幀不重複處理）。
 * @returns 停止監聽的函式
 */
export function onVideoFrame(video: HTMLVideoElement, cb: () => void): () => void {
  let active = true;
  // 型別定義認為一定有，但較舊的瀏覽器沒有這個功能，所以要實際檢查
  const supportsFrameCallback = typeof video.requestVideoFrameCallback === 'function';
  if (supportsFrameCallback) {
    let handle = 0;
    const tick = () => {
      if (!active) return;
      cb();
      handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => {
      active = false;
      video.cancelVideoFrameCallback(handle);
    };
  }
  // 舊瀏覽器：每次畫面更新時檢查影片時間有沒有前進
  let lastTime = -1;
  let raf = 0;
  const loop = () => {
    if (!active) return;
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      cb();
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    active = false;
    cancelAnimationFrame(raf);
  };
}

function cameraErrorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '沒有取得鏡頭權限。請在瀏覽器的網站設定中允許使用相機，然後重新整理頁面。';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '找不到可用的鏡頭。';
    case 'NotReadableError':
      return '鏡頭正被其他程式使用中（例如視訊會議軟體），請關閉後再試。';
    default:
      return `無法開啟鏡頭：${err instanceof Error ? err.message : String(err)}`;
  }
}
