import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'

// 관리자 1 대시보드: 새 제보 알림 줄, 오늘 신규·기한 초과 미조치·이번 달 조치 완료·평균 처리 기간, 우선순위 상위
// 10초마다 다시 불러온다 (실시간 푸시는 만들지 않음)
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
  ]

  return (
    <section className="flex flex-col gap-6">
      {newCount > 0 && (
        <div className="rounded bg-amber-50 p-3 text-sm">접수 대기 제보 {newCount}건 · <Link to="/admin/reports?status=received" className="underline">확인하기</Link></div>
      )}
      <div className="grid grid-cols-4 gap-3">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">{k}</div><div className="text-2xl font-semibold">{v ?? '—'}</div></div>
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
