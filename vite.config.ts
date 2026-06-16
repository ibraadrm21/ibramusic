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
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-piped-yt': {
        target: 'https://api.piped.yt',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-yt/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-piped-moe': {
        target: 'https://pipedapi.moe.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-moe/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-piped-lvk': {
        target: 'https://pipedapi.lvk.li',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-lvk/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-piped-private-coffee': {
        target: 'https://api.piped.private.coffee',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-piped-private-coffee/, ''),
        headers: {
          'Origin': 'https://piped.video',
          'Referer': 'https://piped.video/'
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-invidious-tux': {
        target: 'https://inv.tux.pizza',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-invidious-tux/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-invidious-jing': {
        target: 'https://invidious.jing.rocks',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-invidious-jing/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-invidious-pixora': {
        target: 'https://inv.thepixora.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-invidious-pixora/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/api-invidious-privacydev': {
        target: 'https://invidious.privacydev.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-invidious-privacydev/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['www-authenticate'];
          });
        }
      },
      '/youtube-com': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/youtube-com/, ''),
        headers: {
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      },
      '/youtubei-googleapis': {
        target: 'https://youtubei.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/youtubei-googleapis/, ''),
        headers: {
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      },
      '/googlevideo': {
        target: 'https://redirector.googlevideo.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path: string) => path.replace(/^\/googlevideo\/[^/]+/, ''),
        router: (req: any) => {
          const match = req.url?.match(/^\/googlevideo\/([^/]+)/);
          if (match) {
            return `https://${match[1]}.googlevideo.com`;
          }
          return 'https://redirector.googlevideo.com';
        },
        headers: {
          'User-Agent': 'com.google.ios.youtube/19.17.2 (iPhone16,2; U; CPU iPhone OS 17_4_1 like Mac OS X; en_US)',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/'
        }
      } as any,
      '/api-tidal-track': {
        target: 'https://tidal.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api-tidal-track/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    }
  }
})
