import AdminMetrics from './AdminMetrics.jsx'
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

function Distribution({ title, data, accent = false }) {
  const rows = Object.entries(data ?? {})
  const max = Math.max(1, ...rows.map(([, count]) => count))
  const total = rows.reduce((sum, [, count]) => sum + count, 0) || 1
  return <section className="admin-panel">
    <h2 className="mb-4 font-bold">{title}</h2>
    {rows.length ? <dl className="grid gap-3">
      {rows.map(([label, count]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(48px,1.4fr)_auto_auto] items-center gap-3 text-sm">
        <dt>{label}</dt>
        <dd><div className={`admin-bar ${accent ? 'is-accent' : ''}`} role="img" aria-label={`${label} ${count}`}><span style={{ width: `${Math.max(2, (count / max) * 100)}%` }} /></div></dd>
        <dd className="text-right font-semibold">{count}{accent ? '곳' : '건'}</dd>
        {!accent && <dd className="w-12 text-right text-xs text-sub">{((count / total) * 100).toFixed(1)}%</dd>}
      </div>)}
    </dl> : <p className="text-sm text-sub">해당 기간의 항목이 없어요.</p>}
  </section>
}

export default function AdminReport() {
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [rep, setRep] = useState(null)
  const [error, setError] = useState('')

  const quickPeriod = (period) => {
    const current = new Date(today() + 'T00:00:00Z')
    if (period === 'last-month') {
      current.setUTCDate(0)
      const last = current.toISOString().slice(0, 10)
      setStart(last.slice(0, 8) + '01')
      setEnd(last)
    } else if (period === 'recent') {
      current.setUTCDate(current.getUTCDate() - 29)
      setStart(current.toISOString().slice(0, 10))
      setEnd(today())
    } else {
      setStart(monthStart())
      setEnd(today())
    }
  }

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
        <button type="button" onClick={() => quickPeriod('this-month')} className="admin-secondary">이번 달</button>
        <button type="button" onClick={() => quickPeriod('last-month')} className="admin-secondary">지난달</button>
        <button type="button" onClick={() => quickPeriod('recent')} className="admin-secondary">최근 30일</button>
        <button type="button" onClick={load} className="admin-action">보고서 만들기</button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {rep && (
        <>
          <AdminMetrics items={[
            ['기간 내 접수', `${rep.counts.received}건`, '선택한 기간의 접수 항목'],
            ['기간 내 조치 완료', `${rep.counts.done}건`, '선택한 기간의 완료 항목'],
            ['기한 초과 미완료', `${rep.counts.overdue_open}건`, '현재 기준 기한 경과 항목'],
            ['평균 처리 시간', rep.counts.avg_days_to_done == null ? '—' : `${(rep.counts.avg_days_to_done * 24).toFixed(1)}시간`, '접수부터 완료까지 평균'],
          ]} />
          <div className="admin-report-pair">
            <Distribution title="출처별 접수" data={rep.counts.by_source} />
            <Distribution title="공백 탐지 규칙" data={rep.counts.by_gap_rule} accent />
          </div>
          <div className="admin-report-pair admin-report-preview">
          <article className="admin-panel">
            <h2 className="mb-3 border-b border-line pb-2 font-bold">보고서 미리보기</h2>
            <h3 className="font-bold">성북구 안전 점검 확인서</h3>
            <p className="my-2 text-xs text-sub">보고 기간 · {rep.period.start} ~ {rep.period.end}</p>
            <div className="grid gap-1.5 text-sm">{rep.summary_lines.map((line) => <p key={line}>{line}</p>)}</div>
          </article>
          <div className="admin-panel">
            <h3 className="mb-1 font-semibold">부서별 접수·완료</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500"><tr><th>부서</th><th className="text-right">접수</th><th className="text-right">완료</th></tr></thead>
              <tbody>{rep.by_dept.map((d) => <tr key={d.dept} className="border-t"><td className="py-1">{d.dept}</td><td className="text-right">{d.received}</td><td className="text-right">{d.done}</td></tr>)}</tbody>
            </table>
          </div>
          </div>
          <div className="admin-panel report-tables grid grid-cols-3 gap-6">
            <Table title="AI 판별 유형" data={rep.counts.by_category} />
            <Table title="시설 종류 (주민 선택)" data={rep.counts.by_facility} />
            <Table title="현재 상태 (전체)" data={rep.counts.status_now} />
          </div>
          <div className="admin-panel">
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
