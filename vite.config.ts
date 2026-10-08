import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import qrcode from 'qrcode-terminal';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** 手機測試模式：伺服器啟動後，在終端機印出區網網址與 QR code */
function phoneQrCode(): Plugin {
  return {
    name: 'phone-qr-code',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        // 等 Vite 自己的啟動訊息印完再印
        setTimeout(() => {
          const urls = server.resolvedUrls?.network ?? [];
          if (urls.length === 0) {
            console.log('\n  ⚠ 找不到區網網址：請確認這台 Mac 已連上 Wi-Fi\n');
            return;
          }
          console.log('\n  📱 手機測試：用手機相機掃描下面的 QR code，或在手機瀏覽器輸入');
          for (const url of urls) console.log(`     ${url}`);
          console.log('     ・手機要和這台 Mac 連同一個 Wi-Fi');
          console.log('     ・第一次開啟會出現「連線不是私人連線／憑證」警告，請選「顯示詳細資訊 → 瀏覽此網站」\n');
          qrcode.generate(urls[0]!, { small: true });
        }, 300);
      });
    },
  };
}

/**
 * 開發模式專用：讓「標準動作建置工具」把結果直接存進 generated/ 資料夾。
 * 只接受 generated/ 底下的 .json 檔名，正式網站沒有這個功能。
 */
function saveGeneratedFiles(): Plugin {
  return {
    name: 'save-generated-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save-generated', (req, res) => {
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('file') ?? '';
        if (req.method !== 'POST' || !/^[a-z0-9-]+\.json$/.test(name)) {
          res.statusCode = 400;
          res.end('只能用 POST 存 generated/ 底下的 .json 檔');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', async () => {
          try {
            const dir = resolve(server.config.root, 'generated');
            await mkdir(dir, { recursive: true });
            await writeFile(resolve(dir, name), Buffer.concat(chunks));
            res.end('ok');
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // 相對路徑：部署到任何網址底下都能找到檔案
  base: './',
  // tools/reference.html（標準動作建置工具）只在開發時使用，不會打包進正式網站
  // npm run dev:phone（mode = phone）才開 HTTPS：手機瀏覽器規定 HTTPS 才能開鏡頭
  plugins: [saveGeneratedFiles(), ...(mode === 'phone' ? [basicSsl({ name: 'fitness-coach-dev' }), phoneQrCode()] : [])],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
