// 首頁的「自選影片跟練」區塊：選新影片、列出「我的影片」（跟練、刪除）。
import { deleteVideo, listVideos, type SavedVideo } from '../../storage/video-library';
import { el } from '../dom';
import './follow.css';

export interface MyVideosActions {
  /** 選了一支新影片（要先分析） */
  onNew(file: File): void;
  /**
   * 跟練已分析過的影片。video = 影片檔（存在瀏覽器裡的，或使用者重新選的）。
   * 在點擊當下呼叫，才能播放影片聲音。
   */
  onPlay(saved: SavedVideo, video: Blob): void;
}

function fmtDuration(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export function myVideosSection(actions: MyVideosActions, disabled: boolean): HTMLElement {
  const fileInput = el('input', { type: 'file', accept: 'video/*', hidden: '' });
  const newButton = el('button', { class: 'primary' }, '＋ 選擇影片');
  newButton.disabled = disabled;
  newButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) actions.onNew(f);
  });
  const list = el('ul', { class: 'my-videos' });

  const refresh = async () => {
    const videos = await listVideos();
    list.replaceChildren(
      ...videos.map((v) => {
        const play = el('button', { class: 'primary' }, '▶ 跟練');
        const del = el('button', { title: '從這台裝置刪除' }, '🗑');
        play.disabled = disabled;
        const relink = el('input', { type: 'file', accept: 'video/*', hidden: '' });
        play.addEventListener('click', () => {
          if (v.video) actions.onPlay(v, v.video);
          else relink.click(); // 影片本身沒存下來：請使用者重新選同一支
        });
        relink.addEventListener('change', () => {
          const f = relink.files?.[0];
          if (!f) return;
          if (f.size !== v.fileSize && !confirm('這好像不是當初分析的那支影片，還是要用它跟練嗎？')) return;
          actions.onPlay(v, f);
        });
        del.addEventListener('click', async () => {
          if (!confirm(`要從這台裝置刪除「${v.name}」嗎？`)) return;
          await deleteVideo(v.id);
          void refresh();
        });
        return el(
          'li',
          {},
          el('span', { class: 'mv-name' }, v.name),
          el('span', { class: 'muted' }, `${fmtDuration(v.durationSec)}・${new Date(v.createdAt).toLocaleDateString('zh-TW')}${v.video ? '' : '・需重新選檔'}`),
          play,
          del,
          relink,
        );
      }),
    );
  };
  void refresh();

  return el(
    'section',
    { class: 'home-follow' },
    el('h2', {}, '📼 自選影片跟練'),
    el(
      'p',
      { class: 'muted' },
      '選一支自己手機或電腦裡的運動影片，系統會分析示範者的動作，讓你跟著影片練、即時比對並打分數。影片只在這台裝置上處理，不會上傳。',
    ),
    el('div', { class: 'actions' }, newButton, fileInput),
    list,
  );
}
