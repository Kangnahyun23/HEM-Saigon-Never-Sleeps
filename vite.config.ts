/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Đường dẫn tương đối để cùng một bản build chạy được trên GitHub Pages (/HEM-Saigon-Never-Sleeps/) và itch.io.
  base: './',
  resolve: {
    alias: [
      // Addon của three (OrbitControls, loaders…) import 'three'; trỏ về bản WebGPU để toàn dự án chỉ có MỘT bản three.
      { find: /^three$/, replacement: 'three/webgpu' },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  build: {
    target: 'es2022',
    // Rapier nhúng sẵn WASM (~2 MB) nên bundle lớn; tách vendor ra chunk riêng để trình duyệt cache lâu dài.
    chunkSizeWarningLimit: 4500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge/ },
            { name: 'three', test: /node_modules[\\/]three/ },
          ],
        },
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Vài test mô phỏng / kiểm tra bố cục chạy vài giây; máy CI bận có thể chậm gấp đôi.
    testTimeout: 20_000,
  },
});
