// 把 config/*.json 的「原始文字」打包進網頁，再交給 parseConfigFiles 檢查。
// 用原始文字而不是直接 import JSON，是為了：
//   1. 允許 // 註解與結尾多餘的逗號
//   2. 格式寫錯時能用中文指出第幾行，而不是整個網頁打不開
import { parseConfigFiles, type LoadResult } from './load';

const rawFiles = import.meta.glob<string>('/config/*.json', { query: '?raw', import: 'default', eager: true });

export function loadBundledConfig(): LoadResult {
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(rawFiles)) {
    files[path.slice(path.lastIndexOf('/') + 1)] = text;
  }
  return parseConfigFiles(files);
}
