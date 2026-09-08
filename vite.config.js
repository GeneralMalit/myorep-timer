import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import obfuscator from 'vite-plugin-javascript-obfuscator';
import pkg from './package.json';
import {
  handleEntitlementRefreshRequest,
  handlePasswordSignUpRequest,
  handleProfileUpdateRequest,
} from './src/server/accountHandlers';

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on('end', () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined);
    });

    request.on('error', reject);
  });

const createNodeHeaders = (incomingHeaders) => {
  const headers = new Headers();

  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  return headers;
};

const localAccountApiPlugin = () => {
  const handlers = {
    '/api/account/password-signup': handlePasswordSignUpRequest,
    '/api/account/refresh-entitlement': handleEntitlementRefreshRequest,
    '/api/account/update-profile': handleProfileUpdateRequest,
  };

  return {
    name: 'local-account-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = request.url
          ? new URL(request.url, 'http://127.0.0.1')
          : null;
        const handler = requestUrl ? handlers[requestUrl.pathname] : null;

        if (!handler) {
          next();
          return;
        }

        try {
          const body =
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : await readRequestBody(request);

          const proxiedRequest = new Request(requestUrl.toString(), {
            method: request.method,
            headers: createNodeHeaders(request.headers),
            body,
            duplex: body ? 'half' : undefined,
          });

          const proxiedResponse = await handler(proxiedRequest);
          response.statusCode = proxiedResponse.status;

          proxiedResponse.headers.forEach((value, key) => {
            response.setHeader(key, value);
          });

          const payload = Buffer.from(await proxiedResponse.arrayBuffer());
          response.end(payload);
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not process the local account request.',
            }),
          );
        }
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [name, value] of Object.entries(env)) {
    if (!process.env[name] && typeof value === 'string') {
      process.env[name] = value;
    }
  }

  const isCapacitorMode = mode === 'capacitor' || mode === 'capacitor-release';
  const isCapacitorRelease = mode === 'capacitor-release';
  const shouldObfuscate = isCapacitorRelease;

  return {
    base: isCapacitorMode ? './' : '/',

    plugins: [
      localAccountApiPlugin(),

      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),

      shouldObfuscate ? obfuscator({
        apply: 'build',
        include: [/[\\/]src[\\/](?:store[\\/]useWorkoutStore|utils[\\/](?:audioEngine|timerWorker))\.ts(?:\?.*)?$/],
        options: {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          selfDefending: false,
          simplify: true,
          stringArray: false,
          reservedNames: [
            '^speechSynthesis$',
            '^getVoices$',
            '^speak$',
            '^cancel$',
            '^onvoiceschanged$',
            '^SpeechSynthesisUtterance$',
            '^AudioContext$',
            '^webkitAudioContext$',
            '^Worker$',
            '^postMessage$',
            '^onmessage$',
            '^onmessageerror$',
            '^terminate$',
            '^close$',
            '^importMetaUrl$'
          ]
        }
      }) : null,
    ].filter(Boolean),

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    build: {
      sourcemap: isCapacitorMode && !isCapacitorRelease,

      // Keep the stable, initial UI dependencies in one cacheable chunk. The
      // app-specific entry chunk can then change without invalidating React,
      // Zustand, Radix, or the shared icon/UI helpers on every release.
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [
              {
                name: 'vendor-core',
                test: /node_modules[\\/](?:react|react-dom|zustand|lucide-react|@radix-ui[\\/](?:react-label|react-slot|react-switch)|class-variance-authority|clsx|tailwind-merge)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },

    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  };
});
