import { NavLink, Outlet } from 'react-router-dom'

// 관리자 화면 공통 틀 (데스크톱). 로그인은 만들지 않음.
export default function AdminLayout() {
  const link = ({ isActive }) => `px-3 py-2 ${isActive ? 'font-semibold text-brand' : 'text-gray-600'}`
  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center gap-2 border-b bg-white px-6 py-3 print:hidden">
        <span className="mr-4 font-bold">성북 안전 공백 지도 · 담당자</span>
        <NavLink to="/admin" end className={link}>대시보드</NavLink>
        <NavLink to="/admin/reports" className={link}>목록</NavLink>
        <NavLink to="/admin/integrated" className={link}>통합 점검 후보</NavLink>
        <NavLink to="/admin/report" className={link}>점검 확인서</NavLink>
      </header>
      <main className="mx-auto max-w-6xl p-6 print:p-0"><Outlet /></main>
    </div>
  )
}
