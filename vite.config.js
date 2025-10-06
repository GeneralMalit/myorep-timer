import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 1. Import the default export from the plugin.
// The variable 'obfuscator' will be the function we need.
import obfuscator from 'vite-plugin-javascript-obfuscator';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),

      // 2. Call the imported 'obfuscator' function directly.
      // This is the correct usage.
      mode === 'production' ? obfuscator({
        options: {
          // A strong preset that offers good protection
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          debugProtection: true,
          debugProtectionInterval: 2000,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: true,
          rotateStringArray: true,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.75,
        }
      }) : null,
    ],

    // 3. Disable source maps for production
    build: {
      sourcemap: false,
    },
  };
});