import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { api } from '../../lib/api.js'

const NAV = [
  ['/admin', '대시보드', '현황', 'dashboard'],
  ['/admin/reports', '점검 대상 목록', '점검 목록', 'list'],
  ['/admin/integrated', '통합 점검 후보', '통합 후보', 'integrated'],
  ['/admin/report', '보고서', '보고서', 'report'],
]
const PAGES = {
  '/admin': ['안전 점검 대시보드', '접수 · 검토 · 조치 현황을 확인하세요.'],
  '/admin/reports': ['점검 대상 목록', '점검 대상을 검색하고 처리 상태를 확인하세요.'],
  '/admin/integrated': ['통합 점검 후보', '같은 주소의 시설을 함께 확인하세요.'],
  '/admin/report': ['안전 점검 보고서', '기간별 접수와 조치 현황을 확인하세요.'],
  '/admin/map': ['점검 지도', '규칙이 선별한 점검 후보와 처리 상태를 확인하세요.'],
}

export default function AdminLayout() {
  const { pathname } = useLocation()
  const [title, description] = PAGES[pathname] ?? ['점검 대상 상세', '위치와 담당 부서, 처리 내용을 확인하세요.']
  const [listCount, setListCount] = useState(null) // 메뉴 '점검 대상 목록' 옆 건수
  useEffect(() => { api.adminReports().then((rows) => setListCount(rows.length)).catch(() => {}) }, [pathname])
  const section = pathname === '/admin/map' || pathname.startsWith('/admin/reports/') ? '/admin/reports' : pathname

  return <div className="admin-shell">
    <aside className="admin-sidebar print:hidden">
      <Link to="/admin" className="admin-brand"><img src="/admin-design/logo.svg" alt="안전캐치" /></Link>
      <nav aria-label="관리자 메뉴">
        {NAV.map(([path, label, mobile, icon]) =>
          <Link key={path} to={path} aria-current={section === path ? 'page' : undefined}
            className={`admin-nav-link ${section === path ? 'is-active' : ''}`}>
            <img src={`/admin-design/${icon}.svg`} alt="" />
            <span className="admin-desktop-label">{label}{path === '/admin/reports' && listCount != null && <b className="admin-badge">{listCount}</b>}</span>
            <span className="admin-mobile-label">{mobile}</span>
          </Link>)}
      </nav>
      <details className="admin-sidebar-note">
        <summary>업무 가이드 확인하기</summary>
        <p>점검 대상의 위치를 확인하고, 현장 확인 후 조치 내용과 처리 상태를 기록하세요.</p>
      </details>
    </aside>
    <div className="admin-workspace">
      <header className="admin-header print:hidden">
        <div className="admin-breadcrumb"><Link to="/admin">관리자 홈</Link><span>/</span><strong>{title}</strong></div>
        <div className="admin-account"><Link to="/admin/reports?status=received" aria-label="접수된 점검 대상"><img src="/admin-design/bell.svg" alt="" /></Link><span className="admin-avatar" aria-hidden="true">관</span><span>관리자</span><span className="admin-chevron" aria-hidden="true">⌄</span></div>
        <div className="admin-mobile-heading">
          <Link to="/admin"><img src="/admin-design/logo-mobile.png" alt="안전캐치" width="46" height="46" /></Link>
          <div><strong>{title}</strong><p>{description}</p></div>
        </div>
      </header>
      <main className="admin-content"><Outlet /></main>
      <footer className="admin-footer print:hidden"><span>안전캐치</span><span>공공데이터 분석 결과는 현장 확인 후 확정됩니다.</span></footer>
    </div>
  </div>
}
