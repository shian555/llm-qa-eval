import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发期：5173 端口 + /api 代理到 FastAPI(8000)，免 CORS
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 大依赖分包：提升首屏加载与缓存命中率
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          echarts: ['echarts', 'echarts-for-react'],
        },
      },
    },
  },
})
