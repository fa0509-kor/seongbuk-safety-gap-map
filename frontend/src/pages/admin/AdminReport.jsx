import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'

// 기간별 점검 보고서: 고정 양식에 DB 집계값만 채운 것 (CLAUDE.md 4). 인쇄 → PDF로 저장하면 '점검 확인서'처럼 쓸 수 있음
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) // 한국 날짜
const monthStart = () => `${today().slice(0, 8)}01`

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

export default function AdminReport() {
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [rep, setRep] = useState(null)
  const [error, setError] = useState('')

  const load = () => api.adminPeriodReport({ start, end }).then((r) => { setRep(r); setError('') }).catch((e) => setError(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="admin-page">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="admin-page-heading"><h1>보고서</h1><p>기간별 접수와 조치 현황을 확인하고, 안전 점검 보고서를 출력하세요.</p></div>
        <button type="button" disabled={!rep} onClick={() => window.print()} className="admin-action">↓ 인쇄 · PDF 저장</button>
      </div>
      <div className="admin-panel flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-sm">시작 <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border p-1" /></label>
        <label className="text-sm">끝 <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border p-1" /></label>
        <button type="button" onClick={load} className="admin-action">보고서 만들기</button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {rep && (
        <>
          <header className="admin-panel">
            <h1 className="text-2xl font-bold">성북구 안전 점검 확인서</h1>
            <p className="text-sm text-gray-600">기간 보고 · {rep.period.start} ~ {rep.period.end} · 작성 {rep.generated_at.replace('T', ' ').slice(0, 16)}</p>
          </header>
          <div className="admin-panel flex flex-col gap-1">
            {rep.summary_lines.map((line) => <p key={line}>{line}</p>)}
          </div>
          <div className="admin-panel report-tables grid grid-cols-3 gap-6">
            <Table title="출처별 접수" data={rep.counts.by_source} />
            <Table title="AI 판별 유형" data={rep.counts.by_category} />
            <Table title="시설 종류 (주민 선택)" data={rep.counts.by_facility} />
            <Table title="공백 탐지 규칙" data={rep.counts.by_gap_rule} />
            <Table title="현재 상태 (전체)" data={rep.counts.status_now} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold">부서별 접수·완료</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500"><tr><th>부서</th><th className="text-right">접수</th><th className="text-right">완료</th></tr></thead>
              <tbody>{rep.by_dept.map((d) => <tr key={d.dept} className="border-t"><td className="py-1">{d.dept}</td><td className="text-right">{d.received}</td><td className="text-right">{d.done}</td></tr>)}</tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">우선 처리할 미완료 항목 (규칙 점수순 5건)</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500"><tr><th>번호</th><th>항목</th><th>담당</th><th>상태</th><th className="text-right">점수</th></tr></thead>
              <tbody>{rep.top_open.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-1"><Link to={`/admin/reports/${t.id}`} className="underline print:no-underline">#{t.id}</Link></td>
                  <td>{t.label}{t.overdue && <span className="ml-1 text-danger">기한 초과</span>}</td><td>{t.dept}</td><td>{t.status}</td><td className="text-right">{t.score}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">{rep.note}. 점수는 팀 가정값 v1 규칙(docs/decisions.md). AI 판별은 담당자 확인 전 결과입니다.</p>
        </>
      )}
    </section>
  )
}
