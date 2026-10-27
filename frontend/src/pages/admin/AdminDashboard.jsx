import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'

// 관리자 1 대시보드: 새 제보 알림 줄, 오늘 신규·기한 초과 미조치·이번 달 조치 완료·평균 처리 기간, 우선순위 상위
// 10초마다 다시 불러온다 (실시간 푸시는 만들지 않음)
// 맨 위 '데이터 사전 점검'은 벤치마크(BV: 검사원이 전부 방문) 대비 '데이터가 먼저 본다'를 보여주는 줄 (docs/benchmark.md)

// 기한 내 조치율: 기한이 지났거나 완료된 제보 중 기한 안에 완료한 비율 (backend/app/scoring.py on_time)
const onTime = (o) => (o ? (o.rate_pct == null ? '판단할 건 없음' : `${o.rate_pct}% (${o.on_time}/${o.due_total})`) : undefined)

function Screening({ s }) {
  if (!s || !s.facilities_total) return null
  const pct = s.targets ? Math.round((s.targets_done / s.targets) * 100) : 0
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">데이터 사전 점검 · 현장에 가기 전에 공공데이터로 먼저 걸러낸 곳</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <Link to="/admin/reports?source=gap" className="text-2xl font-semibold">{s.targets}곳</Link>
        <span className="text-gray-500">/ 안전시설 {s.facilities_total.toLocaleString()}곳 ({s.ratio_pct}%)</span>
        <span className="ml-auto text-sm">확인 완료 {s.targets_done}곳 · {pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded bg-gray-100"><div className="h-2 rounded bg-brand" style={{ width: `${pct}%` }} /></div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
        {Object.entries(s.by_rule).map(([k, v]) => <span key={k} className="rounded bg-gray-100 px-2 py-0.5">{k} {v}</span>)}
      </div>
      <p className="mt-2 text-xs text-gray-400">나머지 시설이 안전하다는 뜻은 아닙니다. 규칙에 걸린 곳부터 확인합니다.</p>
    </div>
  )
}
export default function AdminDashboard() {
  const [summary, setSummary] = useState(null)
  const [top, setTop] = useState([])
  const [newCount, setNewCount] = useState(0)

  useEffect(() => {
    const load = () => {
      api.adminSummary().then(setSummary).catch(() => {})
      api.adminReports({ status: 'received' }).then((rows) => {
        setTop(rows.slice(0, 5))
        setNewCount(rows.filter((r) => r.source !== 'gap').length)
      }).catch(() => {})
    }
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  const cards = [
    ['오늘 신규', summary?.today_new],
    ['기한 초과 미조치', summary?.overdue_open],
    ['이번 달 조치 완료', summary?.done_this_month],
    ['평균 처리 기간', summary ? (summary.avg_days_to_done == null ? '완료 건 없음' : `${summary.avg_days_to_done}일`) : undefined],
    ['기한 내 조치율', onTime(summary?.on_time)],
  ]

  return (
    <section className="flex flex-col gap-6">
      {newCount > 0 && (
        <div className="rounded bg-amber-50 p-3 text-sm">접수 대기 제보 {newCount}건 · <Link to="/admin/reports?status=received" className="underline">확인하기</Link></div>
      )}
      <Screening s={summary?.screening} />
      <div className="grid grid-cols-5 gap-3">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white p-4 shadow-sm"><div className="break-keep text-sm text-gray-500">{k}</div><div className="break-keep text-2xl font-semibold">{v ?? '—'}</div></div>
        ))}
      </div>
      <div>
        <h2 className="mb-2 font-semibold">우선순위 상위 (접수 상태, 규칙 점수순)</h2>
        <ul className="divide-y rounded-lg bg-white">
          {top.map((r) => (
            <li key={r.id} className="flex justify-between p-3">
              <Link to={`/admin/reports/${r.id}`}>#{r.id} {r.gap_rule ?? r.ai?.category ?? '-'} · {r.source_label}</Link>
              <span className={r.priority.overdue ? 'font-semibold text-danger' : ''}>{r.priority.total}점{r.priority.overdue && ' · 기한 초과'}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
