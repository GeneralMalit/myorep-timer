// craco.config.js (with more aggressive options)
const WebpackObfuscator = require('webpack-obfuscator');

module.exports = {
  // ... other craco settings
  webpack: {
    plugins: {
      add: [
        process.env.NODE_ENV === 'production'
          ? new WebpackObfuscator({
              // Recommended: A good balance of performance and protection
              rotateStringArray: true,
              stringArray: true,
              stringArrayEncoding: ['base64'], // Can be 'rc4' - more secure but slower
              stringArrayThreshold: 0.75,

              // More advanced options (can impact performance)
              controlFlowFlattening: true, // Drastically changes code structure
              controlFlowFlatteningThreshold: 0.5,
              deadCodeInjection: true, // Injects confusing, non-functional code
              deadCodeInjectionThreshold: 0.4,
              debugProtection: true, // Makes it harder to use DevTools
              debugProtectionInterval: 2000, // Runs the debugger check every 2 seconds
              disableConsoleOutput: true, // Disables console.log, etc. in the output
              
              // Renaming variables, etc. (already done by minification but this is more aggressive)
              identifierNamesGenerator: 'hexadecimal',
              renameGlobals: true,

            }, [/* An array of file names to exclude from obfuscation, e.g., 'vendor.js' */])
          : null,
      ].filter(Boolean),
    },
  },
};