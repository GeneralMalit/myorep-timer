import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import obfuscator from 'vite-plugin-javascript-obfuscator';
import pkg from './package.json';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),

      mode === 'production' ? obfuscator({
        options: {
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          debugProtection: true,
          debugProtectionInterval: 2000,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          rotateStringArray: true,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.75,
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
      sourcemap: false,
    },

    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  };
});
