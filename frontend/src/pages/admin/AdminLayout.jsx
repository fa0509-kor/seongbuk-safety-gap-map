import { NavLink, Outlet } from 'react-router-dom'

// 관리자 화면 공통 틀 (데스크톱). 와이어프레임 '관리자' 왼쪽 메뉴. 로그인은 만들지 않음.
export default function AdminLayout() {
  const link = ({ isActive }) => `flex min-h-11 items-center rounded-lg px-3 text-sm ${isActive ? 'bg-[#2e3138] font-semibold text-white' : 'text-gray-300 hover:text-white'}`
  return (
    <div className="flex min-h-full flex-col bg-page text-ink md:flex-row">
      <nav aria-label="관리자 메뉴" className="flex shrink-0 flex-col gap-1.5 bg-ink px-4 py-6 md:w-[220px] print:hidden">
        <div className="flex items-center gap-2 px-2 pb-5">
          <div className="h-6 w-6 rounded-md bg-blue-500" />
          <div className="text-sm font-semibold text-white">성북 안전 공백 지도 · 담당자</div>
        </div>
        <NavLink to="/admin" end className={link}>대시보드</NavLink>
        <NavLink to="/admin/reports" className={link}>제보·공백 목록</NavLink>
        <NavLink to="/admin/integrated" className={link}>통합 점검 후보</NavLink>
        <NavLink to="/admin/report" className={link}>보고서</NavLink>
        <div className="flex-1" />
        <div className="px-3 text-xs text-gray-400">성북구 안전 담당</div>
      </nav>
      <main className="min-w-0 flex-1 p-6 md:px-8 md:py-7 print:p-0"><Outlet /></main>
    </div>
  )
}
