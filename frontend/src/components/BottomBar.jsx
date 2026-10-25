import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../lib/api.js'
import { myReports } from '../lib/myReports.js'

// 하단바: 지도 | 제보(가운데 카메라) | 내 제보 (새 소식이 있으면 빨간 점 — 푸시 알림 아님). 와이어프레임 하단바.
const Icon = ({ children, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export default function BottomBar() {
  const [news, setNews] = useState(false)

  useEffect(() => {
    const check = () => api.myReports(myReports.ids()).then((r) => setNews(myReports.hasNews(r))).catch(() => {})
    check()
    const timer = setInterval(check, 15000)
    window.addEventListener('sbgap-my-reports', check)
    return () => { clearInterval(timer); window.removeEventListener('sbgap-my-reports', check) }
  }, [])

  const item = ({ isActive }) => `flex w-24 flex-col items-center gap-1 pt-2 text-xs ${isActive ? 'font-semibold text-brand' : 'text-sub'}`

  return (
    <nav aria-label="하단 메뉴" className="fixed inset-x-0 bottom-0 mx-auto flex h-[84px] max-w-md items-start justify-around border-t border-line bg-white">
      <NavLink to="/map" className={item}>
        <Icon><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></Icon>지도
      </NavLink>
      <NavLink to="/report" className={item}>
        <span className="-mt-7 flex h-[60px] w-[60px] items-center justify-center rounded-full border-4 border-white bg-brand text-white">
          <Icon size={26}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Icon>
        </span>제보
      </NavLink>
      <NavLink to="/my" className={item}>
        <span className="relative">
          <Icon><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></Icon>
          {news && <span className="absolute -right-1 top-0 h-2.5 w-2.5 rounded-full bg-danger" aria-label="새 소식" />}
        </span>내 제보
      </NavLink>
    </nav>
  )
}
