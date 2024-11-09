import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            crypto: true,
            stream: true,
            assert: true,
            buffer: true,
            process: true,
            os: true
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            fs: 'browserify-fs',
            path: 'path-browserify',
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',
            util: 'util',
            assert: 'assert',
            os: 'os-browserify/browser',
            process: 'process/browser'
        }
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: './src/index.jsx', 
            output: {
                format: 'cjs',
                entryFileNames: 'bundle.js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]'
            }
        }
    },
    server: {
        port: 3000
    }
});
