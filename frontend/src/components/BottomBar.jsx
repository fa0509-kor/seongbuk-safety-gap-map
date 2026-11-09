import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../lib/api.js'
import { myReports } from '../lib/myReports.js'

import { residentAsset } from './ResidentHeader.jsx'

const tabs = [
  ['/home', '홈', 'Home'],
  ['/map', '동네 지도', 'Map'],
  ['/report', '제보하기', 'Camera'],
  ['/my', '내 활동', 'List'],
]

export default function BottomBar() {
  const [news, setNews] = useState(false)

  useEffect(() => {
    const check = () => api.myReports(myReports.ids()).then((r) => setNews(myReports.hasNews(r))).catch(() => {})
    check()
    const timer = setInterval(check, 15000)
    window.addEventListener('sbgap-my-reports', check)
    return () => { clearInterval(timer); window.removeEventListener('sbgap-my-reports', check) }
  }, [])

  return (
    <nav aria-label="하단 메뉴" className="z-[1100] grid min-h-[72px] shrink-0 grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      {tabs.map(([path, label, icon]) => (
        <NavLink key={path} to={path} className="flex flex-col items-center justify-center gap-1 text-[10px] text-sub">
          {({ isActive }) => <>
            <span className={`relative grid size-7 place-items-center rounded-[10px] ${isActive ? 'bg-[#ebefcb]' : ''}`}>
              <img src={residentAsset(`home-img${icon}.svg`)} alt="" />
              {path === '/my' && news && <span className="absolute right-0 top-0 size-2 rounded-full bg-danger" aria-label="새 소식" />}
            </span>
            <span className={isActive ? 'font-bold text-brand' : ''}>{label}</span>
          </>}
        </NavLink>
      ))}
    </nav>
  )
}
