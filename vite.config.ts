import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api-piped-kavin': {
        target: 'https://pipedapi.kavin.rocks',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-kavin/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        }
      },
      '/api-piped-yt': {
        target: 'https://api.piped.yt',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-yt/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        }
      },
      '/api-piped-moe': {
        target: 'https://pipedapi.moe.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-moe/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        }
      },
      '/api-piped-adminforge': {
        target: 'https://pipedapi.adminforge.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-adminforge/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        }
      },
      '/api-piped-lvk': {
        target: 'https://pipedapi.lvk.li',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-lvk/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        }
      }
    }
  }
})
