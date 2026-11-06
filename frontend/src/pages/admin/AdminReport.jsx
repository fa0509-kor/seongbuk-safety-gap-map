import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'

// 기간별 점검 보고서 (Figma 11/04 최종): 고정 양식에 DB 집계값만 채운 것 (CLAUDE.md 4). 인쇄 → PDF로 저장하면 '점검 확인서'처럼 쓸 수 있음
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) // 한국 날짜
const today = () => kst(Date.now())
const monthStart = () => `${today().slice(0, 8)}01`
const addDays = (n) => kst(Date.now() + n * 86400e3)
const lastMonth = () => {
  const [y, m] = today().split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 2, 1)), end = new Date(Date.UTC(y, m - 1, 0))
  return [prev.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}

function Table({ title, data }) {
  const entries = Object.entries(data ?? {})
  return (
    <div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      {entries.length ? (
        <table className="w-full text-sm"><tbody>
          {entries.map(([k, v]) => <tr key={k} className="border-t"><td className="py-1">{k}</td><td className="text-right">{v}</td></tr>)}
        </tbody></table>
      ) : <p className="text-sm text-gray-500">없음</p>}
    </div>
  )
}

function Bars({ title, data, note, dark }) {
  const entries = Object.entries(data ?? {})
  const total = entries.reduce((a, [, v]) => a + v, 0)
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <div className="admin-card">
      <h2 className="card-h2">{title}</h2>
      {entries.length ? (
        <ul className="bar-list">
          {entries.map(([k, v]) => (
            <li key={k}><span>{k}</span><i><b className={dark ? 'is-dark' : ''} style={{ width: `${(v / max) * 100}%` }} /></i><em>{v}{title.includes('규칙') ? '곳' : '건'}</em>{dark && <small>{total ? ((v / total) * 100).toFixed(1) : '0.0'}%</small>}</li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-sub">없음</p>}
      {note && <p className="mt-3 text-xs text-sub">{note}</p>}
    </div>
  )
}

export default function AdminReport() {
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [rep, setRep] = useState(null)
  const [error, setError] = useState('')

  const load = (s = start, e = end) => api.adminPeriodReport({ start: s, end: e }).then((r) => { setRep(r); setError('') }).catch((err) => setError(err.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const quick = (s, e) => { setStart(s); setEnd(e); load(s, e) }
  const preset = (v) => {
    if (v === 'month') quick(monthStart(), today())
    if (v === 'last') quick(...lastMonth())
    if (v === '30') quick(addDays(-29), today())
  }
  const c = rep?.counts
  const kpis = rep ? [
    ['기간 내 접수', `${c.received}건`, `공백 탐지 ${c.by_source['공백 탐지'] ?? 0}건 · 주민 제보 ${c.by_source['주민 제보'] ?? c.by_source['주민'] ?? 0}건`],
    ['기간 내 조치 완료', `${c.done}건`, '선택한 기간의 완료 항목'],
    ['기한 초과 미완료', `${c.overdue_open}건`, '현재 기준 기한 초과 항목'],
    ['평균 처리 시간', c.avg_days_to_done == null ? '완료 건 없음' : `${c.avg_days_to_done}일`, '접수부터 완료까지 평균'],
  ] : []

  return (
    <section className="flex flex-col gap-5 print:gap-3">
      <div className="page-head print:hidden">
        <div><h1>보고서</h1><p>기간별 접수와 조치 현황을 확인하고, 안전 점검 보고서를 출력하세요.</p></div>
        <button type="button" onClick={() => window.print()} className="btn-dark">인쇄 · PDF 저장</button>
      </div>
      <form className="admin-card filter-card print:hidden" onSubmit={(e) => { e.preventDefault(); load() }}>
        <label className="filter-field"><span>시작일</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="filter-field"><span>종료일</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="filter-field"><span>빠른 기간 선택</span>
          <select defaultValue="month" onChange={(e) => preset(e.target.value)}><option value="month">이번 달</option><option value="last">지난달</option><option value="30">최근 30일</option></select></label>
        <div className="filter-actions"><button type="button" onClick={() => preset('last')} className="btn-light">지난달</button><button type="button" onClick={() => preset('30')} className="btn-light">최근 30일</button><button type="submit" className="btn-dark">보고서 만들기</button></div>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      {rep && (
        <>
          <div className="dashboard-stats grid grid-cols-4 gap-4">
            {kpis.map(([k, v, sub]) => <div key={k} className="admin-card kpi"><span className="kpi-label">{k}</span><b className="kpi-value">{v}</b><span className="kpi-sub">{sub}</span></div>)}
          </div>
          <div className="report-bars grid grid-cols-2 gap-4">
            <Bars title="출처별 접수" data={c.by_source} dark note={`선택한 기간에 접수된 총 ${c.received}건 기준`} />
            <Bars title="공백 탐지 규칙" data={c.by_gap_rule} note={`안전시설 ${rep.screening.facilities_total.toLocaleString()}곳 중 사전 확인 대상 ${rep.screening.targets}곳`} />
          </div>
          <div className="report-preview grid grid-cols-[1fr_360px] gap-4">
            <div className="admin-card">
              <div className="card-title"><h2>보고서 미리보기</h2><span className="chip chip-lime">기간 보고</span></div>
              <h3 className="mt-4 text-lg font-bold">성북구 안전 점검 확인서</h3>
              <p className="mt-1 text-xs text-sub">보고 기간: {rep.period.start} ~ {rep.period.end} · 작성 {rep.generated_at.replace('T', ' ').slice(0, 16)}</p>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">{rep.summary_lines.map((line) => <p key={line}>{line}</p>)}</div>
              <p className="report-note">{rep.note}. 점수는 팀 가정값 v1 규칙(docs/decisions.md). AI 판별은 담당자 확인 전 결과입니다.</p>
            </div>
            <div className="admin-card">
              <h2 className="card-h2">부서별 접수 · 완료</h2>
              <table className="admin-plain-table mt-3 w-full text-sm">
                <thead><tr><th>담당 부서</th><th className="text-right">접수</th><th className="text-right">완료</th></tr></thead>
                <tbody>{rep.by_dept.map((d) => <tr key={d.dept}><td data-label="담당 부서">{d.dept}</td><td data-label="접수" className="text-right">{d.received}</td><td data-label="완료" className="text-right">{d.done}</td></tr>)}</tbody>
              </table>
              <p className="mt-3 text-xs text-sub">전체 상태 · {Object.entries(c.status_now).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
            </div>
          </div>
          <div className="admin-card">
            <h2 className="card-h2">세부 집계</h2>
            <div className="report-tables mt-3 grid grid-cols-3 gap-6">
              <Table title="AI 판별 유형" data={c.by_category} />
              <Table title="시설 종류 (주민 선택)" data={c.by_facility} />
              <Table title="현재 상태 (전체)" data={c.status_now} />
            </div>
            <h3 className="mb-1 mt-6 font-semibold">우선 처리할 미완료 항목 (규칙 점수순 5건)</h3>
            <table className="admin-plain-table w-full text-sm">
              <thead className="text-left"><tr><th>번호</th><th>항목</th><th>담당</th><th>상태</th><th className="text-right">점수</th></tr></thead>
              <tbody>{rep.top_open.map((t) => (
                <tr key={t.id}>
                  <td data-label="번호"><Link to={`/admin/reports/${t.id}`} className="underline print:no-underline">#{t.id}</Link></td>
                  <td data-label="항목">{t.label}{t.overdue && <span className="ml-1 text-danger">기한 초과</span>}</td><td data-label="담당">{t.dept}</td><td data-label="상태">{t.status}</td><td data-label="점수" className="text-right">{t.score}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
