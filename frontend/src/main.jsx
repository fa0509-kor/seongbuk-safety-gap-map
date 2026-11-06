import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { myReports } from './lib/myReports.js'

myReports.ensureNickname() // 처음 들어오면 별명이 자동으로 정해진다 (제보 화면 등이 그려지기 전에)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
