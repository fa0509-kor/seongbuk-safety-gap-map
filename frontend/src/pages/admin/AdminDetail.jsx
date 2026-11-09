import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import AIResultCard from '../../components/AIResultCard.jsx'
import AftercarePanel from '../../components/AftercarePanel.jsx'
import PhotoModal from '../../components/PhotoModal.jsx'
import PriorityCard from '../../components/PriorityCard.jsx'
import { api } from '../../lib/api.js'
import { resizeImage } from '../../lib/image.js'

// 관리자 3 상세: AI가 본 것 / 규칙이 매긴 점수 / 사람의 결정 세 칸 + 처리 이력
const STATUSES = { received: '접수', review: '검토', action: '조치', done: '완료' }
const CATEGORIES = ['콘크리트 균열', '박리', '백태/누수', '철근 노출', '기타']

// 접수일 기준으로 사진을 며칠 전에 찍었는지 (같은 날이면 표시하지 않음)
const agoText = (taken, created) => {
  const d = Math.floor((new Date(created).getTime() - new Date(taken).getTime()) / 86400000)
  return d >= 1 ? ` (접수 ${d}일 전)` : ''
}

export default function AdminDetail() {
  const { id } = useParams()
  const [r, setR] = useState(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [depts, setDepts] = useState([])
  const [results, setResults] = useState({}) // 조치 완료 결과 이름 (보수 완료 / 소유자 안내 / 이상 없음)
  const [viewer, setViewer] = useState(null) // 크게 보는 사진 {src, title}

  useEffect(() => { api.adminReport(id).then(setR).catch((e) => setMsg(e.message)) }, [id])
  useEffect(() => { api.meta().then((m) => { setDepts(m.departments); setResults(m.results ?? {}) }).catch(() => {}) }, [])

  async function save(patch) {
    try { setR(await api.adminUpdate(id, patch)); setNote(''); setMsg('저장됨') } catch (e) { setMsg(`실패: ${e.message}`) }
  }

  async function afterPhoto(file) {
    const photo = await api.uploadPhoto(await resizeImage(file), { classify: false })
    save({ after_photo_key: photo.key, note: note || '조치 후 사진' })
  }

  if (!r) return <p>{msg || '불러오는 중…'}</p>
  return (
    <section className="admin-page">
      <div className="admin-page-heading"><h1>점검 대상 상세</h1><p>#{r.id} · {r.gap_rule ?? r.ai?.category ?? r.source_label} · {r.status_label}</p></div>
      <div className="admin-detail-grid">
        <div className="rounded-lg bg-white p-4">
          <h2 className="mb-2 font-semibold">{r.gap_rule ?? "AI 판별 결과"}</h2>
          {r.photo_url && <img src={r.photo_url} alt="제보 사진" className="mb-2 rounded" />}
          {(r.photos ?? []).length > 0 && (
            <ul className="mb-2 flex flex-col gap-2 text-sm">
              {r.photos.map((p) => (
                <li key={p.position} className="flex gap-2">
                  {p.position > 0 && p.photo_url && <img src={p.photo_url} alt={`사진 ${p.position + 1}`} className="h-16 w-16 shrink-0 rounded object-cover" />}
                  <div>
                    <span className="font-medium">{p.position === 0 ? '대표 사진' : `사진 ${p.position + 1}`}</span>
                    <span className="text-gray-500">{p.taken_at ? ` · 촬영 ${new Date(p.taken_at).toLocaleString('ko-KR')}${agoText(p.taken_at, r.created_at)}` : ' · 촬영 일시 없음'}</span>
                    {p.memo && <p>{p.memo}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {r.gap_rule
            ? <div className="text-sm"><p className="text-gray-500">AI 판단 없음 — 공공데이터 규칙으로 찾은 항목</p><p className="mt-2 font-semibold">{r.gap_rule}</p><p>{r.gap_reason}</p><p className="text-gray-500">{r.address}</p></div>
            : <AIResultCard ai={r.ai} />}
          {r.same_client_reports > 1 && <p className="mt-2 text-sm text-gray-600">같은 브라우저(식별번호 {r.client_code}{r.client_nickname && `, 별명 ${r.client_nickname}`})에서 올라온 제보 {r.same_client_reports}건{r.same_client_24h > 1 && ` (이 제보 전후 24시간 안에 ${r.same_client_24h}건)`}<span className="block text-xs text-gray-400">브라우저 기준이라 사람을 특정하지는 못합니다</span></p>}
          {r.stale_photo && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-sm">사진을 찍은 날이 접수일보다 {r.photo_age_days}일 앞서요. 옛 사진을 다시 올린 것일 수 있으니 확인해 주세요. 점수에는 반영하지 않았습니다.</p>}
          {r.memo && <p className="mt-2 text-sm">{r.source === 'gap' ? r.memo : `주민 메모: ${r.memo}`}</p>}
          {r.confirm_count > 0 && (
            <p className="text-sm text-gray-600">같은 곳 확인 {r.confirm_count}명
              {r.cross_checked && <span className="ml-1 rounded bg-teal-100 px-1.5 py-0.5 text-xs font-semibold text-teal-800">교차확인</span>}
              <span className="block text-xs text-gray-400">로그인이 없어 브라우저 기준입니다</span></p>
          )}
        </div>
        <div className="admin-panel admin-detail-score">
          <h2 className="mb-3 font-bold">규칙이 매긴 점수</h2>
          <PriorityCard priority={r.priority} />
        </div>
        <div className="admin-panel flex flex-col gap-2">
          <h2 className="font-bold">위치 및 담당 정보</h2>
          <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-sub">주소</dt><dd>{r.address || '주소 없음'}</dd>
            <dt className="text-sub">출처</dt><dd>{r.source_label}</dd>
            <dt className="text-sub">처리 상태</dt><dd>{r.status_label}</dd>
          </dl>
          <label className="text-xs text-gray-500">담당 부서 (규칙이 1차 배정{r.facility_label && ` · 시설: ${r.facility_label}`})</label>
          <select value={r.dept ?? ''} onChange={(e) => save({ dept: e.target.value })} className="rounded border p-1 text-sm">
            {r.dept && !depts.includes(r.dept) && <option value={r.dept}>{r.dept}</option>}
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {/* 담당자가 확인하면 주민 지도·홈에 공개된다(접수 상태는 숫자로만 보임) */}
          {r.status === 'received' && !r.gap_rule && (
            <button type="button" onClick={() => save({ status: 'review', note: note || null })} className="admin-action self-start">확인 후 공개</button>
          )}
          <select value={r.status} onChange={(e) => save({ status: e.target.value, note: note || null })} className="rounded border p-1">
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {r.status === 'done' && (
            <label className="flex flex-col gap-1 text-xs text-gray-500">조치 결과 (주민 화면에 "시설 + 결함 + 결과"로 보임)
              <select value={r.result ?? ''} onChange={(e) => save({ result: e.target.value })} className="rounded border p-1 text-sm text-ink">
                <option value="">선택 안 함</option>
                {Object.entries(results).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm"><input type="checkbox" checked={r.dispatch} onChange={(e) => save({ dispatch: e.target.checked })} /> 현장 출동</label>
          {!r.gap_rule && (
            <label className="flex flex-col gap-1 text-xs text-gray-500">AI와 다르면 실제 유형 (모아 두었다가 나중에 학습·프롬프트 예시에 씁니다)
              <select value={r.true_category ?? ''} onChange={(e) => save({ true_category: e.target.value })} className="rounded border p-1 text-sm text-ink">
                <option value="">AI 분류 그대로</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm"><input type="checkbox" checked={r.false_positive} onChange={(e) => save({ false_positive: e.target.checked })} /> AI 오탐</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="처리 메모" className="rounded border p-1 text-sm" />
          <button type="button" onClick={() => save({ note })} disabled={!note} className="rounded border py-1 text-sm disabled:opacity-40">메모 남기기</button>
          <input defaultValue={r.dept_note ?? ''} onBlur={(e) => e.target.value !== (r.dept_note ?? '') && save({ dept_note: e.target.value })}
            placeholder="주민에게 보이는 담당 부서 메모" className="rounded border p-1 text-sm" />
          <label className="cursor-pointer text-sm text-brand underline">
            조치 후 사진 올리기
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && afterPhoto(e.target.files[0])} />
          </label>
          {msg && <p className="text-xs text-gray-500">{msg}</p>}
        </div>
      </div>
      <AftercarePanel report={r} />
      <div className="rounded-lg bg-white p-4">
        <h2 className="mb-2 font-semibold">처리 이력</h2>
        <ol className="flex flex-col gap-1 text-sm">
          {r.history.map((h, i) => (
            <li key={i}>{new Date(h.at).toLocaleString('ko-KR')} · {h.to_status_label}{h.note && ` · ${h.note}`}{h.photo_url && <> · <button type="button" onClick={() => setViewer({ src: h.photo_url, title: `${h.to_status_label} · 조치 후 사진` })} className="underline">사진 보기</button></>}</li>
          ))}
        </ol>
      </div>
      <PhotoModal src={viewer?.src} title={viewer?.title} onClose={() => setViewer(null)} />
      <Link to="/admin/reports" className="admin-action self-start">목록으로 돌아가기</Link>
    </section>
  )
}
