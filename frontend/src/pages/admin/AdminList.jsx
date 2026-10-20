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
    <select value={params.get(k) ?? ''} onChange={(e) => set(k, e.target.value)} className="rounded border bg-white p-1">
      {Object.entries(options).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {select('source', SOURCES)}
        {select('status', STATUSES)}
        {select('category', Object.fromEntries(CATEGORIES.map((c) => [c, c || '전체 유형'])))}
        {select('sort', { priority: '우선순위순', new: '최신순', old: '오래된순' })}
        <label className="ml-auto cursor-pointer rounded bg-brand px-3 py-1 text-white">
          CCTV 프레임 업로드
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadCctv(e.target.files[0])} />
        </label>
      </div>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
      <table className="w-full rounded-lg bg-white text-sm">
        <thead className="text-left text-gray-500"><tr><th className="p-2">번호</th><th>점수</th><th>접수</th><th>출처</th><th>유형·규칙</th><th>AI 확신도</th><th>담당</th><th>상태</th><th>기한</th><th>오탐</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t hover:bg-gray-50">
              <td className="p-2"><Link to={`/admin/reports/${r.id}`} className="text-brand underline">#{r.id}</Link></td>
              <td className="font-semibold">{r.priority.total}</td>
              <td>{new Date(r.created_at).toLocaleString('ko-KR')}</td>
              <td>{r.source_label}{r.is_demo && ' (체험)'}</td>
              <td>{r.gap_rule ? <span>{r.gap_rule} <span className="text-xs text-gray-500">규칙</span></span> : (r.ai?.category ?? '-')}</td>
              <td>{r.ai?.confidence ?? '-'}</td>
              <td className="text-xs">{r.dept ?? '-'}</td>
              <td>{r.status_label}</td>
              <td className={r.priority.overdue ? 'font-semibold text-danger' : 'text-gray-500'}>
                {r.priority.due_at ? (r.priority.overdue ? '초과' : new Date(r.priority.due_at).toLocaleDateString('ko-KR')) : '-'}
              </td>
              <td>{r.false_positive ? '오탐' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="text-gray-500">항목 없음</p>}
    </section>
  )
}
