import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 개발 중: npm run dev → http://localhost:5173 . /api 요청은 백엔드(8000)로 넘긴다.
// host: true 라서 같은 와이파이의 폰에서도 http://<노트북 IP>:5173 으로 열 수 있다 (위치 권한은 https에서만 동작).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
