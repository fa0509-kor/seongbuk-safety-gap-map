import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import AIResultCard from '../../components/AIResultCard.jsx'
import PriorityCard from '../../components/PriorityCard.jsx'
import { api } from '../../lib/api.js'
import { resizeImage } from '../../lib/image.js'

// 관리자 3 상세: AI가 본 것 / 규칙이 매긴 점수 / 사람의 결정 세 칸 + 처리 이력
const STATUSES = { received: '접수', review: '검토', action: '조치', done: '완료' }
const CATEGORIES = ['콘크리트 균열', '박리', '백태/누수', '철근 노출', '기타']

export default function AdminDetail() {
  const { id } = useParams()
  const [r, setR] = useState(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [depts, setDepts] = useState([])

  useEffect(() => { api.adminReport(id).then(setR).catch((e) => setMsg(e.message)) }, [id])
  useEffect(() => { api.meta().then((m) => setDepts(m.departments)).catch(() => {}) }, [])

  async function save(patch) {
    try { setR(await api.adminUpdate(id, patch)); setNote(''); setMsg('저장됨') } catch (e) { setMsg(`실패: ${e.message}`) }
  }

  async function afterPhoto(file) {
    const photo = await api.uploadPhoto(await resizeImage(file), { classify: false })
    save({ after_photo_key: photo.key, note: note || '조치 후 사진' })
  }

  if (!r) return <p>{msg || '불러오는 중…'}</p>
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">#{r.id} · {r.source_label} · {r.status_label}</h1>
      <div className="detail-grid grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-white p-4">
          <h2 className="mb-2 font-semibold">AI가 본 것</h2>
          {r.photo_url && <img src={r.photo_url} alt="제보 사진" className="mb-2 rounded" />}
          {(r.photos ?? []).length > 0 && (
            <ul className="mb-2 flex flex-col gap-2 text-sm">
              {r.photos.map((p) => (
                <li key={p.position} className="flex gap-2">
                  {p.position > 0 && p.photo_url && <img src={p.photo_url} alt={`사진 ${p.position + 1}`} className="h-16 w-16 shrink-0 rounded object-cover" />}
                  <div>
                    <span className="font-medium">{p.position === 0 ? '대표 사진' : `사진 ${p.position + 1}`}</span>
                    <span className="text-gray-500">{p.taken_at ? ` · 촬영 ${new Date(p.taken_at).toLocaleString('ko-KR')}` : ' · 촬영 일시 없음'}</span>
                    {p.memo && <p>{p.memo}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {r.gap_rule
            ? <div className="text-sm"><p className="text-gray-500">AI 판단 없음 — 공공데이터 규칙으로 찾은 항목</p><p className="mt-2 font-semibold">{r.gap_rule}</p><p>{r.gap_reason}</p><p className="text-gray-500">{r.address}</p></div>
            : <AIResultCard ai={r.ai} />}
          {r.memo && <p className="mt-2 text-sm">{r.source === 'gap' ? r.memo : `주민 메모: ${r.memo}`}</p>}
          {r.confirm_count > 0 && (
            <p className="text-sm text-gray-600">같은 곳 확인 {r.confirm_count}명
              {r.cross_checked && <span className="ml-1 rounded bg-teal-100 px-1.5 py-0.5 text-xs font-semibold text-teal-800">교차확인</span>}
              <span className="block text-xs text-gray-400">로그인이 없어 브라우저 기준입니다</span></p>
          )}
        </div>
        <div className="rounded-lg bg-white p-4">
          <h2 className="mb-2 font-semibold">규칙이 매긴 점수</h2>
          <PriorityCard priority={r.priority} />
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-white p-4">
          <h2 className="font-semibold">사람의 결정</h2>
          <label className="text-xs text-gray-500">담당 부서 (규칙이 1차 배정{r.facility_label && ` · 시설: ${r.facility_label}`})</label>
          <select value={r.dept ?? ''} onChange={(e) => save({ dept: e.target.value })} className="rounded border p-1 text-sm">
            {r.dept && !depts.includes(r.dept) && <option value={r.dept}>{r.dept}</option>}
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={r.status} onChange={(e) => save({ status: e.target.value, note: note || null })} className="rounded border p-1">
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
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
      <div className="rounded-lg bg-white p-4">
        <h2 className="mb-2 font-semibold">처리 이력</h2>
        <ol className="flex flex-col gap-1 text-sm">
          {r.history.map((h, i) => (
            <li key={i}>{new Date(h.at).toLocaleString('ko-KR')} · {h.to_status_label}{h.note && ` · ${h.note}`}{h.photo_url && <> · <a href={h.photo_url} className="underline">사진</a></>}</li>
          ))}
        </ol>
      </div>
    </section>
  )
}
