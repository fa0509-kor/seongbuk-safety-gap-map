import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { resizeImage } from '../../lib/image.js'

// 관리자 2 목록 (Figma 11/04 최종): 사전 점검 숫자 4칸, 검색·필터 카드, 전체 대상 표. 출처·유형·상태 필터, 우선순위 정렬(기본),
// CCTV 프레임 업로드(CCTV는 주민 사진과 같은 분류에 넣는 입력 채널), 엑셀 내려받기는 파일 형식·범위·포함 항목을 확인한 뒤 받는다.
const SOURCES = { '': '전체 출처', resident: '주민', gap: '공백 탐지', cctv: 'CCTV' }
const STATUSES = { '': '전체 상태', received: '접수', review: '검토', action: '조치', done: '완료' }
const SEASONS = { '': '전체 시기', 해빙기: '해빙기(2~3월)', 우기: '우기(5~6월)', 동절기: '동절기(11~12월)' }
const CATEGORIES = ['', '콘크리트 균열', '박리', '백태/누수', '철근 노출', '기타']
const PAGE = 8
const dl = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>

export default function AdminList() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState('')
  const [summary, setSummary] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [exportOpen, setExportOpen] = useState(false)
  const filters = Object.fromEntries([...params].filter(([, v]) => v))

  const load = () => api.adminReports(filters).then(setRows).catch((e) => setMsg(e.message))
  useEffect(() => { load(); setPage(1) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.adminSummary().then(setSummary).catch(() => {}) }, [])

  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p) }
  const reset = () => { setParams(new URLSearchParams()); setKeyword(''); setQ('') }

  async function uploadCctv(file) {
    setMsg('CCTV 프레임 분류 중…')
    try {
      const photo = await api.uploadPhoto(await resizeImage(file))
      const r = await api.adminCreate({ photo_key: photo.key, source: 'cctv' })
      setMsg(`#${r.id} 등록: ${r.ai?.category}`)
      load()
    } catch (e) { setMsg(`실패: ${e.message}`) }
  }

  const shownRows = useMemo(() => {
    const t = q.trim()
    return t ? rows.filter((r) => `#${r.id} ${r.id} ${r.gap_rule ?? ''} ${r.ai?.category ?? ''} ${r.address ?? ''} ${r.dept ?? ''}`.includes(t)) : rows
  }, [rows, q])
  const pages = Math.max(1, Math.ceil(shownRows.length / PAGE))
  const view = shownRows.slice((page - 1) * PAGE, page * PAGE)

  const select = (k, options, label) => (
    <label className="filter-field"><span>{label}</span>
      <select value={params.get(k) ?? ''} onChange={(e) => set(k, e.target.value)}>
        {Object.entries(options).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  )

  const byRule = summary?.screening?.by_rule ?? {}
  const ruleCards = [['사전 점검 대상', summary?.screening?.targets, '공공데이터 기반 현장 확인 대상'], ...Object.entries(byRule).map(([k, v]) => [k, v, '규칙에 걸린 점검 대상'])].slice(0, 4)
  const sourceBadge = (r) => (r.source === 'gap' ? 'bg-violet-100 text-violet-800' : 'bg-gray-200 text-ink')
  const statusChip = (r) => {
    if (r.priority.overdue) return 'bg-red-100 text-red-800'
    return r.status === 'done' ? 'bg-teal-100 text-teal-800' : r.status === 'received' ? 'bg-[#eef0e6] text-ink' : 'bg-amber-100 text-amber-800'
  }
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
  const scopeText = [params.get('source') && SOURCES[params.get('source')], params.get('status') && STATUSES[params.get('status')], params.get('category'), params.get('season')].filter(Boolean).join(' · ') || '전체 대상'

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div><h1>점검 대상 목록</h1><p>접수된 안전 점검 대상을 검색하고, 담당 부서와 처리 상태를 관리하세요.</p></div>
        <label className="btn-light cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          CCTV 프레임 업로드
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadCctv(e.target.files[0])} />
        </label>
      </div>
      <div className="dashboard-stats grid grid-cols-4 gap-4">
        {ruleCards.map(([k, v, sub]) => <div key={k} className="admin-card kpi"><span className="kpi-label">{k}</span><b className="kpi-value">{v ?? '—'}{v != null && '곳'}</b><span className="kpi-sub">{sub}</span></div>)}
      </div>
      <form className="admin-card filter-card" onSubmit={(e) => { e.preventDefault(); setQ(keyword); setPage(1) }}>
        <label className="filter-field filter-wide"><span>검색어</span><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="번호 또는 점검 내용 검색" /></label>
        {select('source', SOURCES, '출처')}
        {select('status', STATUSES, '처리 상태')}
        {select('category', Object.fromEntries(CATEGORIES.map((c) => [c, c || '전체 유형'])), '점검 유형')}
        {select('season', SEASONS, '점검 시기')}
        <div className="filter-actions"><button type="button" onClick={reset} className="btn-light">초기화</button><button type="submit" className="btn-dark">검색</button></div>
        <p className="filter-note">출처: 주민 신고 · 공백 탐지 · CCTV / 상태: 접수 → 검토 → 조치 → 완료</p>
      </form>
      {msg && <p className="text-sm text-sub">{msg}</p>}
      <div className="admin-card table-card">
        <div className="card-title"><h2>전체 대상 <small>{shownRows.length}건</small></h2>
          <div className="flex flex-wrap items-center gap-2">
            {select('sort', { priority: '우선순위순', new: '최신순', old: '오래된순' }, '정렬')}
            <button type="button" onClick={() => setExportOpen(true)} className="btn-light">{dl}엑셀 내려받기</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="admin-list-table w-full text-sm">
            <thead>
              <tr className="text-left text-[13px]">
                {['번호', '점검 내용·유형', '점수', '출처', 'AI 확신도', '담당 부서', '주민 확인', '상태', '접수일', '상세'].map((h) => <th key={h} className="whitespace-nowrap font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td data-label="번호" className="whitespace-nowrap font-semibold"><Link to={`/admin/reports/${r.id}`}>#{r.id}</Link></td>
                  <td data-label="점검 내용·유형" className="font-semibold">
                    {r.gap_rule ? r.gap_rule : (r.ai?.category ?? '-')}
                    {r.priority.needs_review && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">확인 필요</span>}
                  </td>
                  <td data-label="점수" className="whitespace-nowrap font-bold">{r.priority.total}점</td>
                  <td data-label="출처" className="whitespace-nowrap">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${sourceBadge(r)}`}>{r.source_label}</span>
                    {r.is_demo && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">체험</span>}
                  </td>
                  <td data-label="AI 확신도" className="whitespace-nowrap text-sub">{r.gap_rule ? '—' : (r.ai?.confidence != null ? `${r.ai.confidence}%` : '-')}</td>
                  <td data-label="담당 부서" className="whitespace-nowrap text-xs">{r.dept ?? '-'}</td>
                  <td data-label="주민 확인" className="whitespace-nowrap text-xs">
                    {r.source === 'gap' ? '-' : r.cross_checked
                      ? <span className="rounded bg-teal-100 px-1.5 py-0.5 font-semibold text-teal-800">교차확인 {r.confirm_count}명</span>
                      : <span className="text-sub">{r.confirm_count ? `${r.confirm_count}명` : '-'}</span>}
                  </td>
                  <td data-label="상태"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusChip(r)}`}>{r.priority.overdue ? '기한 초과' : r.status_label}</span>{r.false_positive && <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-sub">오탐</span>}{r.season && <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-sub">{r.season}</span>}{r.same_client_reports > 1 && <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-sub">같은 브라우저 {r.same_client_reports}건</span>}{r.stale_photo && <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">오래된 사진</span>}{r.aftercare?.recurrence && <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">재발</span>}{r.aftercare?.recheck_due && <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">재점검</span>}</td>
                  <td data-label="접수일" className="whitespace-nowrap text-sub">{new Date(r.created_at).toLocaleDateString('ko-KR')}{r.photo_age_days > 0 && <span className={`block text-xs ${r.stale_photo ? 'font-semibold text-amber-700' : 'text-gray-400'}`}>사진은 {r.photo_age_days}일 전 촬영</span>}</td>
                  <td data-label="상세" className="whitespace-nowrap"><Link to={`/admin/reports/${r.id}`}>보기 →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!view.length && <p className="p-4 text-sub">항목 없음</p>}
        <div className="pager">
          <span>총 {shownRows.length}건 중 {shownRows.length ? (page - 1) * PAGE + 1 : 0}~{Math.min(page * PAGE, shownRows.length)}건</span>
          <div>
            <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="이전">‹</button>
            {pageNumbers.map((n, i) => <span key={n}>{i > 0 && n - pageNumbers[i - 1] > 1 && <em>…</em>}<button type="button" onClick={() => setPage(n)} className={n === page ? 'is-current' : ''}>{n}</button></span>)}
            <button type="button" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages} aria-label="다음">›</button>
          </div>
        </div>
      </div>
      <p className="text-[13px] text-sub">공백 탐지 항목은 AI가 아니라 규칙으로 찾은 것입니다. 신뢰도 대신 "규칙"으로 표시합니다. 교차확인은 '나도 봤어요'가 3명 이상일 때 표시합니다. 로그인이 없어 브라우저 기준이라, 같은 사람이 여러 브라우저로 누르면 늘 수 있습니다.</p>
      {exportOpen && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={() => setExportOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 id="export-title">엑셀 내려받기</h2>
            <p className="text-sm text-sub">아래 내용으로 점검 대장을 내려받습니다.</p>
            <dl>
              <div><dt>파일 형식</dt><dd>엑셀 (.xlsx)</dd></div>
              <div><dt>내려받을 범위</dt><dd>{scopeText} · 현재 필터 기준 {rows.length}건</dd></div>
              <div><dt>포함 항목</dt><dd>접수번호·접수일시·출처·유형·AI 신뢰도·담당 부서·위치·우선순위 점수·처리 상태·기한·완료일시·담당자 메모·주민 확인 수 등 22개 열</dd></div>
              <div><dt>제외</dt><dd>사진과 주민 개인 정보, 체험용 제보는 넣지 않습니다.</dd></div>
            </dl>
            <div className="admin-modal-actions">
              <button type="button" onClick={() => setExportOpen(false)} className="btn-light">취소</button>
              <a href={api.ledgerUrl(filters)} download onClick={() => setExportOpen(false)} className="btn-dark">{dl}내려받기</a>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
