import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { resizeImage } from '../../lib/image.js'

// 관리자 2 목록: 출처·유형·상태 필터, 우선순위 정렬(기본), CCTV 프레임 업로드 (CCTV는 주민 사진과 같은 분류에 넣는 입력 채널)
const SOURCES = { '': '전체 출처', resident: '주민', gap: '공백 탐지', cctv: 'CCTV' }
const STATUSES = { '': '전체 상태', received: '접수', review: '검토', action: '조치', done: '완료' }
const SEASONS = { '': '전체 시기', 해빙기: '해빙기(2~3월)', 우기: '우기(5~6월)', 동절기: '동절기(11~12월)' }
const CATEGORIES = ['', '콘크리트 균열', '박리', '백태/누수', '철근 노출', '기타']

export default function AdminList() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [page, setPage] = useState(0)
  const dialog = useRef(null)
  const pageSize = 8
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
  const currentPage = Math.min(page, lastPage)
  const [msg, setMsg] = useState('')
  const filters = Object.fromEntries([...params].filter(([, v]) => v))

  const exportCount = rows.filter((r) => !r.is_demo).length
  const load = () => api.adminReports(filters).then(setRows).catch((e) => setMsg(e.message))
  useEffect(() => {
    let active = true
    setPage(0)
    setSearch(params.get('search') ?? '')
    api.adminReports(filters).then((data) => { if (active) setRows(data) })
      .catch((e) => { if (active) setMsg(e.message) })
    return () => { active = false }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <section className="admin-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="admin-page-heading"><h1>점검 대상 목록</h1><p>접수된 안전 점검 대상을 검색하고, 담당 부서와 처리 상태를 관리하세요.</p></div>
        <div className="flex flex-wrap items-center gap-2">
        <Link to="/admin/map" className="admin-secondary">점검 지도</Link>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          CCTV 프레임 업로드
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadCctv(e.target.files[0])} />
        </label>
        </div>
      </div>
      <form className="admin-panel flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); set('search', search.trim()) }}>
        <input type="search" aria-label="점검 대상 검색" placeholder="번호 또는 점검 내용 검색" value={search} onChange={(e) => setSearch(e.target.value)} />

        {select('source', SOURCES)}
        {select('status', STATUSES)}
        {select('category', Object.fromEntries(CATEGORIES.map((c) => [c, c || '전체 유형'])))}
        {select('season', SEASONS)}
        <button type="button" className="admin-secondary" onClick={() => { setSearch(''); setParams({}) }}>초기화</button>
        <button type="submit" className="admin-action">검색</button>
      </form>
      {msg && <p className="text-sm text-sub">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h2 className="font-bold">전체 대상 {rows.length}건</h2>
          <div className="flex flex-wrap gap-2">
            {select('sort', { priority: '우선순위순', new: '최신순', old: '오래된순' })}
            <button type="button" className="admin-secondary" onClick={() => dialog.current.showModal()}>↓ 엑셀 내려받기</button>
          </div>
        </div>
        <table className="admin-list-table w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[13px] font-medium text-sub">
              {['우선순위', '번호', '접수', '출처', '유형·규칙', 'AI 신뢰도', '담당', '주민 확인', '상태', '기한', '오탐'].map((h) => <th key={h} className="whitespace-nowrap px-3.5 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/50">
                <td data-label="우선순위" className="whitespace-nowrap px-3.5 py-3.5 font-bold">{r.priority.total}</td>
                <td data-label="번호" className="whitespace-nowrap px-3.5"><Link to={`/admin/reports/${r.id}`} className="font-semibold text-brand">#{r.id}</Link></td>
                <td data-label="접수" className="whitespace-nowrap px-3.5 text-sub">{new Date(r.created_at).toLocaleString('ko-KR')}{r.photo_age_days > 0 && <span className={`block text-xs ${r.stale_photo ? 'font-semibold text-amber-700' : 'text-gray-400'}`}>사진은 {r.photo_age_days}일 전 촬영</span>}</td>
                <td data-label="출처" className="whitespace-nowrap px-3.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${sourceBadge(r)}`}>{r.source_label}</span>
                  {r.is_demo && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">체험</span>}
                </td>
                <td data-label="유형·규칙" className="whitespace-nowrap px-3.5">
                  {r.gap_rule ? r.gap_rule : (r.ai?.category ?? '-')}
                  {r.priority.needs_review && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">확인 필요</span>}
                </td>
                <td data-label="AI 신뢰도" className="whitespace-nowrap px-3.5 text-sub">{r.gap_rule ? '규칙' : (r.ai?.confidence != null ? `${r.ai.confidence}%` : '-')}</td>
                <td data-label="담당" className="whitespace-nowrap px-3.5 text-xs">{r.dept ?? '-'}</td>
                <td data-label="주민 확인" className="whitespace-nowrap px-3.5 text-xs">
                  {r.source === 'gap' ? '-' : r.cross_checked
                    ? <span className="rounded bg-teal-100 px-1.5 py-0.5 font-semibold text-teal-800">교차확인 {r.confirm_count}명</span>
                    : <span className="text-sub">{r.confirm_count ? `${r.confirm_count}명` : '-'}</span>}
                </td>
                <td data-label="상태" className="whitespace-nowrap px-3.5"><span className={`rounded-full px-2 py-0.5 text-xs ${statusChip(r)}`}>{r.priority.overdue ? '기한 초과' : r.status_label}</span>{r.season && <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-sub">{r.season}</span>}{r.same_client_reports > 1 && <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-sub">같은 브라우저 {r.same_client_reports}건</span>}{r.stale_photo && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">오래된 사진</span>}{r.aftercare?.recurrence && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">재발</span>}{r.aftercare?.recheck_due && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">재점검</span>}</td>
                <td data-label="기한" className={`whitespace-nowrap px-3.5 ${r.priority.overdue ? 'font-semibold text-red-700' : 'text-sub'}`}>
                  {r.priority.due_at ? new Date(r.priority.due_at).toLocaleDateString('ko-KR') : '-'}
                </td>
                <td data-label="오탐" className="whitespace-nowrap px-3.5">{r.false_positive ? '오탐' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lastPage > 0 && <nav aria-label="점검 목록 페이지" className="flex items-center justify-center gap-3 text-sm">
        <button className="admin-secondary" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button>
        <span>{currentPage + 1} / {lastPage + 1}</span>
        <button className="admin-secondary" type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>다음</button>
      </nav>}
      <dialog ref={dialog} aria-labelledby="ledger-title" className="admin-dialog">
        <h2 id="ledger-title" className="text-xl font-bold">점검 대상 엑셀 내려받기</h2>
        <p className="mt-2 text-sm text-sub">현재 검색과 필터에 맞는 점검 대상을 업무용 시트로 저장합니다.</p>
        <div className="my-5 grid gap-2 rounded-xl bg-page p-4 text-sm">
          <strong>내려받을 대상 {exportCount}건</strong>
          <p>Excel 통합 문서 (.xlsx) · 체험용 제보 제외</p>
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button type="button" className="admin-secondary" onClick={() => dialog.current.close()}>취소</button>
          <a className="admin-action" href={api.ledgerUrl({ ...filters, include_demo: false })} download onClick={() => dialog.current.close()}>엑셀 내려받기 · {exportCount}건</a>
        </div>
      </dialog>
      {!rows.length && <p className="text-sub">항목 없음</p>}
      <p className="text-[13px] text-sub">공백 탐지 항목은 AI가 아니라 규칙으로 찾은 것입니다. 신뢰도 대신 "규칙"으로 표시합니다.</p>
      <p className="text-[13px] text-sub">교차확인은 '나도 봤어요'가 3명 이상일 때 표시합니다. 로그인이 없어 브라우저 기준이라, 같은 사람이 여러 브라우저로 누르면 늘 수 있습니다. 엑셀은 위 필터를 그대로 반영하고 체험용 제보는 뺍니다.</p>
    </section>
  )
}
