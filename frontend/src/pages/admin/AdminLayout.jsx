import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../../lib/api.js'

// 관리자 공통 틀 (Figma 11/04 '주민·관리자 최종 정리' 관리자용 기준): 남색 사이드바 + 흰 로고 칩, 위 줄 경로·알림·관리자, 아래 줄 안내
const Icon = ({ d }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const NAV = [
  ['/admin', '대시보드', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  ['/admin/reports', '점검 대상 목록', 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  ['/admin/integrated', '통합 점검 후보', 'M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
  ['/admin/report', '보고서', 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6'],
]

function AdminBrand() {
  return <Link to="/admin" className="admin-logo" aria-label="안전캐치 관리자 홈"><span className="admin-logo-box">안전캐치</span></Link>
}

export default function AdminLayout() {
  const { pathname } = useLocation()
  const [total, setTotal] = useState(null)
  useEffect(() => { api.adminReports({}).then((rows) => setTotal(rows.length)).catch(() => {}) }, [pathname])
  const current = NAV.find(([path]) => path === pathname)?.[1] ?? '점검 대상 상세'
  return <div className="admin-shell">
    <aside className="admin-sidebar print:hidden">
      <div className="admin-brand"><AdminBrand /></div>
      <nav aria-label="관리자 메뉴">{NAV.map(([path, label, d]) => <NavLink key={path} to={path} end={path === '/admin'} className={({ isActive }) => `admin-nav-link ${isActive || (path === '/admin/reports' && pathname.startsWith('/admin/reports/')) ? 'is-active' : ''}`}><Icon d={d} /><span>{label}</span>{path === '/admin/reports' && total != null && <em className="nav-badge">{total}</em>}</NavLink>)}</nav>
      <div className="admin-guide">
        <p>현장 점검이 처음이신가요?</p>
        <Link to="/admin/report">업무 가이드 확인하기 <span aria-hidden="true">↗</span></Link>
      </div>
      <p className="admin-settings"><Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />관리자 설정</p>
    </aside>
    <div className="admin-workspace">
      <header className="admin-header print:hidden">
        <div className="mobile-brand"><AdminBrand /></div>
        <nav className="admin-crumb" aria-label="현재 위치"><Link to="/admin">관리자 홈</Link><span aria-hidden="true">/</span><strong>{current}</strong></nav>
        <div className="admin-user">
          <button type="button" className="admin-bell" aria-label="알림"><Icon d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8zM10 20a2 2 0 004 0" /></button>
          <span className="admin-avatar" aria-hidden="true">관</span><span>관리자</span>
        </div>
      </header>
      <main className="admin-content"><Outlet /></main>
      <footer className="admin-footer print:hidden"><span>안전캐치</span><span>공공데이터 분석 결과는 현장 확인 후 확정하세요.</span></footer>
    </div>
  </div>
}
