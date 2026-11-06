import { Navigate, Outlet, Route, Routes, useSearchParams } from 'react-router-dom'
import BottomBar from './components/BottomBar.jsx'
import Intro from './pages/Intro.jsx'
import Home from './pages/Home.jsx'
import Report from './pages/Report.jsx'
import MapPage from './pages/MapPage.jsx'
import MyReports from './pages/MyReports.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminList from './pages/admin/AdminList.jsx'
import AdminDetail from './pages/admin/AdminDetail.jsx'
import AdminIntegrated from './pages/admin/AdminIntegrated.jsx'
import AdminReport from './pages/admin/AdminReport.jsx'

// 화면 목록은 CLAUDE.md '화면' 표와 같다. 주민은 모바일, 관리자는 데스크톱(/admin).
function ResidentLayout() {
  return (
    <div className="mx-auto flex h-full max-w-[402px] flex-col bg-page">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BottomBar />
    </div>
  )
}

function ReportRoute() {
  const [params] = useSearchParams()
  return <Report key={params.get('demo') === '1' ? 'demo' : 'regular'} />
}

export default function App() {
  return (
    <Routes>
      <Route index element={<Intro />} /> {/* QR 진입 */}
      <Route element={<ResidentLayout />}>
        <Route path="home" element={<Home />} />
        <Route path="report" element={<ReportRoute />} />  {/* 주민 2 제보 */}
        <Route path="map" element={<MapPage />} />    {/* 주민 3 지도 */}
        <Route path="my" element={<MyReports />} />   {/* 주민 4 내 제보 */}
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />           {/* 관리자 1 대시보드 */}
        <Route path="reports" element={<AdminList />} />       {/* 관리자 2 목록 */}
        <Route path="reports/:id" element={<AdminDetail />} /> {/* 관리자 3 상세 */}
        <Route path="integrated" element={<AdminIntegrated />} /> {/* 통합 점검 후보 (공백 아님) */}
        <Route path="report" element={<AdminReport />} />       {/* 기간별 보고서 */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
