import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Load .env into process.env for the api/ handlers only (local dev; Vercel injects its own).
// Variables without the VITE_ prefix are never bundled into the React app.
// Parsed directly and always applied, so .env edits take effect on the next request.
function applyDotEnv(mode) {
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const file = path.resolve(process.cwd(), name)
    if (fs.existsSync(file)) Object.assign(process.env, parseEnv(fs.readFileSync(file, 'utf8')))
  }
}

// Runs the Vercel functions in api/ inside the Vite dev server, so `npm run dev`
// serves /api/* locally without the Vercel CLI.
function vercelApiDev() {
  return {
    name: 'morphcall-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = (req.url || '').split('?')[0].match(/^\/api\/([a-z0-9-]+)$/i)
        if (!match) return next()

        const file = path.resolve(process.cwd(), 'api', `${match[1]}.js`)
        if (!fs.existsSync(file)) return next()

        applyDotEnv(server.config.mode)

        try {
          const mod = await server.ssrLoadModule(file)
          await mod.default(req, res)
        } catch (err) {
          server.ssrFixStacktrace(err)
          console.error(`[api] ${req.url} failed:`, err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  applyDotEnv(mode)

  return {
    plugins: [
      react(),
      vercelApiDev(),
      // Installable PWA. injectManifest keeps our own service worker (src/sw.js, which also
      // handles incoming-call push notifications) and adds precaching of the built files.
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectRegister: false, // registered in src/calling/pushNotifications.js
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'Voice Call',
          short_name: 'Voice Call',
          description: 'Free browser voice calls with your contacts.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#090a0f',
          theme_color: '#090a0f',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    server: {
      host: true,
      // HTTPS tunnels for testing on a phone (browsers only allow the mic and push on secure origins)
      allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io', '.trycloudflare.com'],
    },
  }
})
