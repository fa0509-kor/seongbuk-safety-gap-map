import AdminMetrics from './AdminMetrics.jsx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FirstReviewCard from '../../components/FirstReviewCard.jsx'
import { api } from '../../lib/api.js'

// 관리자 1 대시보드: 새 제보 알림 줄, 오늘 신규·기한 초과 미조치·이번 달 조치 완료·평균 처리 기간, 우선순위 상위
// 10초마다 다시 불러온다 (실시간 푸시는 만들지 않음)
// 맨 위 '데이터 사전 점검'은 벤치마크(BV: 검사원이 전부 방문) 대비 '데이터가 먼저 본다'를 보여주는 줄 (docs/benchmark.md)

// 기한 내 조치 시작률: 기한이 지났거나 조치를 시작한 제보 중 기한 안에 조치를 시작한 비율 (backend/app/scoring.py on_time)
const onTime = (o) => (o ? (o.rate_pct == null ? '판단할 건 없음' : `${o.rate_pct}% (${o.on_time}/${o.due_total})`) : undefined)

function Screening({ s }) {
  if (!s || !s.facilities_total) return null
  const pct = s.targets ? Math.round((s.targets_done / s.targets) * 100) : 0
  return (
    <section className="admin-panel admin-screening">
      <div>
        <h2 className="font-bold">공공데이터 사전 점검 <span className="rounded bg-[#ebefcb] px-2 py-1 text-xs">현장 확인 필요</span></h2>
        <p className="my-3 flex flex-wrap items-baseline gap-2"><Link to="/admin/reports?source=gap" className="text-2xl font-bold">{s.targets}곳</Link>
          <span className="text-xs text-sub">전체 안전시설 {s.facilities_total.toLocaleString()}곳 중 {s.ratio_pct}%</span></p>
        <div className="flex justify-between text-sm"><span>현장 확인 완료 {s.targets_done}곳</span><span>{pct}%</span></div>
        <div className="admin-bar my-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="현장 확인 완료 비율"><span style={{ width: `${pct}%` }} /></div>
        <p className="text-xs text-sub">공공데이터로 선별한 의심 대상입니다. 실제 위험 여부는 현장에서 확인하세요.</p>
      </div>
      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="mb-2 text-sm font-bold">유형별 점검 대상</h3>
        <dl className="grid gap-2 text-sm">
          {Object.entries(s.by_rule).map(([label, count]) => <div key={label} className="flex justify-between gap-2"><dt>{label}</dt><dd className="shrink-0">{count}곳</dd></div>)}
        </dl>
      </div>
    </section>
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
    ['오늘 신규', summary?.today_new, '오늘 접수된 점검 대상'],
    ['기한 초과 미조치', summary?.overdue_open, '처리 기한을 넘긴 대상'],
    ['이번 달 조치 완료', summary?.done_this_month, '이번 달 처리한 점검 대상'],
    ['평균 처리 기간', summary ? (summary.avg_days_to_done == null ? '완료 건 없음' : `${summary.avg_days_to_done}일`) : undefined, '접수부터 조치 완료까지'],
  ]
  const ac = summary?.aftercare

  return (
    <section className="dashboard-page flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="admin-page-heading"><h1>안전 점검 대시보드</h1><p>성북구의 안전 공백을 확인하고, 우선순위에 따라 현장 점검을 진행하세요.</p></div>
        <Link to="/admin/report" className="admin-secondary">↓ 보고서 보기</Link>
      </div>
      {newCount > 0 && (
        <div className="rounded bg-amber-50 p-3 text-sm">접수 대기 제보 {newCount}건 · <Link to="/admin/reports?status=received" className="underline">확인하기</Link></div>
      )}
      {ac && (ac.reopened + ac.recurred + ac.recheck_due > 0) && (
        <div className="rounded bg-amber-50 p-3 text-sm">조치 후 관리 · 아직 그대로라는 의견 {ac.reopened}건 · 재발 {ac.recurred}건 · 재점검 필요 {ac.recheck_due}건</div>
      )}
      <AdminMetrics items={cards} className="admin-dashboard-metrics" />
      <Screening s={summary?.screening} />
      <div className="admin-priority-grid">
      <article className="admin-panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">우선 점검 대상</h2><Link to="/admin/reports" className="admin-secondary">전체 목록 보기</Link></div>
        <table className="admin-priority-table w-full text-sm">
          <thead><tr className="text-left text-[13px] text-sub">{['번호', '점검 내용', '우선순위', '처리 상태', '상세 보기'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="whitespace-nowrap px-3 py-3 font-semibold">#{r.id}</td>
                <td className="px-3 py-3 font-semibold">{r.gap_rule ?? r.ai?.category ?? '-'}<span className="ml-1 text-xs font-normal text-sub">· {r.source_label}</span></td>
                <td className={`whitespace-nowrap px-3 py-3 ${r.priority.overdue ? 'font-semibold text-danger' : ''}`}>{r.priority.total}점{r.priority.overdue && ' · 기한 초과'}</td>
                <td className="whitespace-nowrap px-3 py-3"><span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs">{r.status_label}</span></td>
                <td className="whitespace-nowrap px-3 py-3"><Link to={`/admin/reports/${r.id}`} className="font-semibold text-brand">상세 보기 →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-sub">접수 상태 · 규칙 점수순으로 정렬된 목록입니다.</p>
      </article>
      <aside className="admin-callout">
        <span className="grid size-11 place-items-center rounded-xl bg-accent"><img src="/admin-design/shield.svg" alt="" /></span>
        <h2 className="mt-4 font-bold">데이터 확인에서<br />현장 안전까지</h2>
        <p className="mt-2 text-sm">공공데이터를 바탕으로 확인이 필요한 곳부터 점검하세요.</p>
        <Link to="/admin/integrated" className="mt-4 block rounded-lg bg-accent p-2.5 text-center text-sm font-bold text-brand">통합 점검 후보 확인 →</Link>
      </aside>
      </div>
      <FirstReviewCard fr={summary?.first_review} />
      {summary?.on_time && <p className="text-sm text-sub">기한 내 조치 시작률 · {onTime(summary.on_time)}</p>}
    </section>
  )
}
