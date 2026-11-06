import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RewardRequests from '../../components/RewardRequests.jsx'
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
    <div className="admin-card screening-card">
      <div className="screening-main">
        <div className="card-title"><h2>공공데이터 사전 점검</h2><span className="chip chip-lime">현장 확인 필요</span></div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <Link to="/admin/reports?source=gap" className="big-number">{s.targets}곳</Link>
          <span className="text-sub text-[13px]">/ 전체 안전시설 {s.facilities_total.toLocaleString()}곳 중 {s.ratio_pct}%</span>
        </div>
        <div className="mt-4 flex items-center justify-between text-[13px]"><b>현장 확인 완료 {s.targets_done}곳</b><span>{pct}%</span></div>
        <div className="mt-2 h-2 rounded-full bg-[#eef0e6]"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
        <p className="mt-3 text-xs text-sub">공공데이터로 선별한 의심 대상입니다. 실제 위험 여부는 현장에서 확인하세요.</p>
      </div>
      <div className="screening-types">
        <h3>유형별 점검 대상</h3>
        <ul>{Object.entries(s.by_rule).map(([k, v]) => <li key={k}><span>{k}</span><b>{v}곳</b></li>)}</ul>
      </div>
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
    ['오늘 신규', summary?.today_new, '오늘 접수된 점검 대상'],
    ['기한 초과 미조치', summary?.overdue_open, '처리 기한을 넘긴 대상'],
    ['이번 달 조치 완료', summary?.done_this_month, '이번 달 처리한 점검 대상'],
    ['평균 처리 기간', summary ? (summary.avg_days_to_done == null ? '완료 건 없음' : `${summary.avg_days_to_done}일`) : undefined, '접수부터 조치 완료까지'],
  ]
  const ac = summary?.aftercare
  const rate = onTime(summary?.on_time)

  return (
    <section className="dashboard-page flex flex-col gap-5">
      <div className="page-head">
        <div><h1>안전 점검 대시보드</h1><p>성북구의 안전 공백을 확인하고, 우선순위에 따라 현장 점검을 진행하세요.</p></div>
        <Link to="/admin/report" className="btn-light"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>보고서 다운로드</Link>
      </div>
      {newCount > 0 && (
        <div className="admin-notice">접수 대기 제보 {newCount}건 · <Link to="/admin/reports?status=received" className="underline">확인하기</Link></div>
      )}
      {ac && (ac.reopened + ac.recurred + ac.recheck_due > 0) && (
        <div className="admin-notice">조치 후 관리 · 아직 그대로라는 의견 {ac.reopened}건 · 재발 {ac.recurred}건 · 재점검 필요 {ac.recheck_due}건</div>
      )}
      <RewardRequests />
      <div className="dashboard-stats grid grid-cols-4 gap-4">
        {cards.map(([k, v, sub]) => (
          <div key={k} className="admin-card kpi"><span className="kpi-label">{k}</span><b className="kpi-value">{v ?? '—'}</b><span className="kpi-sub">{sub}</span></div>
        ))}
      </div>
      <Screening s={summary?.screening} />
      <div className="dashboard-bottom grid grid-cols-[1fr_320px] gap-4">
        <div className="admin-card">
          <div className="card-title"><h2>우선 점검 대상 <small>상위 {top.length}건</small></h2><Link to="/admin/reports" className="btn-light btn-sm">전체 목록 보기</Link></div>
          <table className="admin-plain-table mt-3 w-full text-sm">
            <thead><tr><th>번호</th><th>점검 내용</th><th>우선순위</th><th>처리 상태</th><th>상세 보기</th></tr></thead>
            <tbody>
              {top.map((r) => (
                <tr key={r.id}>
                  <td data-label="번호">#{r.id}</td>
                  <td data-label="점검 내용"><b>{r.gap_rule ?? r.ai?.category ?? '-'}</b><span className="block text-xs text-sub">{r.source_label}</span></td>
                  <td data-label="우선순위" className={r.priority.overdue ? 'font-semibold text-danger' : ''}>{r.priority.total}점{r.priority.overdue && ' · 기한 초과'}</td>
                  <td data-label="처리 상태"><span className="chip chip-lime">{r.status_label}</span></td>
                  <td data-label="상세 보기"><Link to={`/admin/reports/${r.id}`}>상세 보기 →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!top.length && <p className="mt-3 text-sm text-sub">접수 상태의 항목이 없습니다.</p>}
          <p className="mt-3 text-xs text-sub">접수 상태 · 규칙 점수순으로 정렬된 목록입니다.{rate && ` 기한 내 조치 시작률 ${rate}.`}</p>
        </div>
        <aside className="admin-cta">
          <span className="cta-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" /></svg></span>
          <h2>데이터 확인에서<br />현장 안전까지</h2>
          <p>공공데이터 분석 결과를 바탕으로 확인이 필요한 곳부터 점검하세요.</p>
          <ol><li><b>01</b>점검 대상과 위치 확인</li><li><b>02</b>현장 확인 후 상태 변경</li><li><b>03</b>조치 내용 기록 및 보고</li></ol>
          <Link to="/admin/integrated" className="cta-button">통합 점검 후보 확인 →</Link>
        </aside>
      </div>
    </section>
  )
}
