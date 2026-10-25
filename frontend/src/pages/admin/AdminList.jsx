import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { resizeImage } from '../../lib/image.js'

// 관리자 2 목록: 출처·유형·상태 필터, 우선순위 정렬(기본), CCTV 프레임 업로드 (CCTV는 주민 사진과 같은 분류에 넣는 입력 채널)
const SOURCES = { '': '전체 출처', resident: '주민', gap: '공백 탐지', cctv: 'CCTV' }
const STATUSES = { '': '전체 상태', received: '접수', review: '검토', action: '조치', done: '완료' }
const CATEGORIES = ['', '콘크리트 균열', '박리', '백태/누수', '철근 노출', '기타']

export default function AdminList() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState('')
  const filters = Object.fromEntries([...params].filter(([, v]) => v))

  const load = () => api.adminReports(filters).then(setRows).catch((e) => setMsg(e.message))
  useEffect(() => { load() }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p) }

  async function uploadCctv(file) {
    setMsg('CCTV 프레임 분류 중…')
    try {
      const photo = await api.uploadPhoto(await resizeImage(file))
      const r = await api.adminCreate({ photo_key: photo.key, source: 'cctv' })
      setMsg(`#${r.id} 등록: ${r.ai?.category}`)
      load()
    } catch (e) { setMsg(`실패: ${e.message}`) }
  }

  const select = (k, options) => (
    <select value={params.get(k) ?? ''} onChange={(e) => set(k, e.target.value)} className="min-h-10 rounded-lg border border-line bg-white px-3 text-[13px]">
      {Object.entries(options).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  )

  const sourceBadge = (r) => (r.source === 'gap' ? 'bg-violet-100 text-violet-800' : 'bg-gray-200 text-ink')
  const statusChip = (r) => {
    if (r.priority.overdue) return 'bg-red-100 text-red-800'
    return r.status === 'done' ? 'bg-teal-100 text-teal-800' : r.status === 'received' ? 'bg-gray-200 text-ink' : 'bg-amber-100 text-amber-800'
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold">제보·공백 목록</h1>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          CCTV 프레임 업로드
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadCctv(e.target.files[0])} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {select('source', SOURCES)}
        {select('status', STATUSES)}
        {select('category', Object.fromEntries(CATEGORIES.map((c) => [c, c || '전체 유형'])))}
        {select('sort', { priority: '우선순위순', new: '최신순', old: '오래된순' })}
      </div>
      {msg && <p className="text-sm text-sub">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[13px] font-medium text-sub">
              {['우선순위', '번호', '접수', '출처', '유형·규칙', 'AI 신뢰도', '담당', '상태', '기한', '오탐'].map((h) => <th key={h} className="whitespace-nowrap px-3.5 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/50">
                <td className="whitespace-nowrap px-3.5 py-3.5 font-bold">{r.priority.total}</td>
                <td className="whitespace-nowrap px-3.5"><Link to={`/admin/reports/${r.id}`} className="font-semibold text-brand">#{r.id}</Link></td>
                <td className="whitespace-nowrap px-3.5 text-sub">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                <td className="whitespace-nowrap px-3.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${sourceBadge(r)}`}>{r.source_label}</span>
                  {r.is_demo && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">체험</span>}
                </td>
                <td className="whitespace-nowrap px-3.5">{r.gap_rule ? r.gap_rule : (r.ai?.category ?? '-')}</td>
                <td className="whitespace-nowrap px-3.5 text-sub">{r.gap_rule ? '규칙' : (r.ai?.confidence != null ? `${r.ai.confidence}%` : '-')}</td>
                <td className="whitespace-nowrap px-3.5 text-xs">{r.dept ?? '-'}</td>
                <td className="whitespace-nowrap px-3.5"><span className={`rounded-full px-2 py-0.5 text-xs ${statusChip(r)}`}>{r.priority.overdue ? '기한 초과' : r.status_label}</span></td>
                <td className={`whitespace-nowrap px-3.5 ${r.priority.overdue ? 'font-semibold text-red-700' : 'text-sub'}`}>
                  {r.priority.due_at ? new Date(r.priority.due_at).toLocaleDateString('ko-KR') : '-'}
                </td>
                <td className="whitespace-nowrap px-3.5">{r.false_positive ? '오탐' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="text-sub">항목 없음</p>}
      <p className="text-[13px] text-sub">공백 탐지 항목은 AI가 아니라 규칙으로 찾은 것입니다. 신뢰도 대신 "규칙"으로 표시합니다.</p>
    </section>
  )
}
