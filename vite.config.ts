import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'copy-asset-folder',
      closeBundle() {
        const srcFile = path.resolve(__dirname, 'asset/urban_house.glb');
        const destDir = path.resolve(__dirname, 'dist/asset');
        const destFile = path.resolve(destDir, 'urban_house.glb');
        if (fs.existsSync(srcFile)) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(srcFile, destFile);
        }
      },
    },
  ],
  build: {
    rollupOptions: {
      external: ['three', /^three\/addons\//],
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
