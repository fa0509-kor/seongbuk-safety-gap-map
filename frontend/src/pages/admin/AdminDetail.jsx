import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import AIResultCard from '../../components/AIResultCard.jsx'
import PriorityCard from '../../components/PriorityCard.jsx'
import { api } from '../../lib/api.js'
import { resizeImage } from '../../lib/image.js'

// 관리자 3 상세: AI가 본 것 / 규칙이 매긴 점수 / 사람의 결정 세 칸 + 처리 이력
const STATUSES = { received: '접수', review: '검토', action: '조치', done: '완료' }

export default function AdminDetail() {
  const { id } = useParams()
  const [r, setR] = useState(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { api.adminReport(id).then(setR).catch((e) => setMsg(e.message)) }, [id])

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
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-white p-4">
          <h2 className="mb-2 font-semibold">AI가 본 것</h2>
          {r.photo_url && <img src={r.photo_url} alt="제보 사진" className="mb-2 rounded" />}
          {r.gap_rule
            ? <div className="text-sm"><p className="text-gray-500">AI 판단 없음 — 공공데이터 규칙으로 찾은 항목</p><p className="mt-2 font-semibold">{r.gap_rule}</p><p>{r.gap_reason}</p><p className="text-gray-500">{r.address}</p></div>
            : <AIResultCard ai={r.ai} />}
          {r.memo && <p className="mt-2 text-sm">{r.source === 'gap' ? r.memo : `주민 메모: ${r.memo}`}</p>}
        </div>
        <div className="rounded-lg bg-white p-4">
          <h2 className="mb-2 font-semibold">규칙이 매긴 점수</h2>
          <PriorityCard priority={r.priority} />
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-white p-4">
          <h2 className="font-semibold">사람의 결정</h2>
          <select value={r.status} onChange={(e) => save({ status: e.target.value, note: note || null })} className="rounded border p-1">
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="text-sm"><input type="checkbox" checked={r.dispatch} onChange={(e) => save({ dispatch: e.target.checked })} /> 현장 출동</label>
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
