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

export default defineConfig(({ mode }) => ({
  // 相對路徑：部署到任何網址底下都能找到檔案
  base: './',
  // npm run dev:phone（mode = phone）才開 HTTPS：手機瀏覽器規定 HTTPS 才能開鏡頭
  plugins: mode === 'phone' ? [basicSsl({ name: 'fitness-coach-dev' }), phoneQrCode()] : [],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
