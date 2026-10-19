import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../lib/api.js'
import { myReports } from '../lib/myReports.js'

// 하단바: 지도 | 제보(가운데 카메라) | 내 제보 (새 소식이 있으면 빨간 점 — 푸시 알림 아님)
export default function BottomBar() {
  const [news, setNews] = useState(false)

  useEffect(() => {
    const check = () => api.myReports(myReports.ids()).then((r) => setNews(myReports.hasNews(r))).catch(() => {})
    check()
    const timer = setInterval(check, 15000)
    window.addEventListener('sbgap-my-reports', check)
    return () => { clearInterval(timer); window.removeEventListener('sbgap-my-reports', check) }
  }, [])

  const item = ({ isActive }) => `flex flex-1 flex-col items-center py-2 text-xs ${isActive ? 'text-brand font-semibold' : 'text-gray-500'}`

  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t bg-white">
      <NavLink to="/map" className={item}>지도</NavLink>
      <NavLink to="/report" className={item}>
        <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg text-white">📷</span>
        제보
      </NavLink>
      <NavLink to="/my" className={item}>
        <span className="relative">
          내 제보
          {news && <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-danger" aria-label="새 소식" />}
        </span>
      </NavLink>
    </nav>
  )
}
