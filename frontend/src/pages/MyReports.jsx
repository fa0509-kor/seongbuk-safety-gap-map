import { useEffect, useState } from 'react'
import StatusSteps from '../components/StatusSteps.jsx'
import { api } from '../lib/api.js'
import { myReports } from '../lib/myReports.js'

// 주민 4 내 제보: 상태 진행, 제보 사진과 조치 후 사진, 담당 부서 메모.
// 이 화면을 열면 '확인한 시각'을 저장해 하단바 빨간 점이 꺼진다.
export default function MyReports() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.myReports(myReports.ids())
      .then((r) => { setList(r); myReports.markSeen() })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="p-5 text-danger">불러오기 실패: {error}</p>
  if (!list) return <p className="p-5">불러오는 중…</p>
  if (!list.length) return <section className="min-h-full bg-page p-5 pt-12"><h1 className="text-[22px] font-bold">내 제보</h1><p className="mt-4 text-sub">아직 이 폰에서 보낸 제보가 없습니다.</p></section>

  const chip = (st) => (st === 'done' ? 'bg-teal-100 text-teal-800' : st === 'received' ? 'bg-gray-200 text-ink' : 'bg-amber-100 text-amber-800')
  return (
    <section className="flex min-h-full flex-col gap-3.5 bg-page px-5 pb-6 pt-12 text-ink">
      <h1 className="text-[22px] font-bold">내 제보</h1>
      {list.map((r) => (
        <article key={r.public_id} className={`flex flex-col gap-3.5 rounded-2xl bg-white p-4 ${r.status === 'done' ? 'border-2 border-teal-700' : 'border border-line'}`}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">{r.ai?.category ?? '분류 없음'}{r.facility_label && ` · ${r.facility_label}`}</span>
              <span className="text-xs text-sub">{new Date(r.created_at).toLocaleDateString('ko-KR')} · 접수번호 {r.public_id}</span>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip(r.status)}`}>{r.status_label ?? r.status}</span>
          </div>
          <StatusSteps status={r.status} />
          <div className="grid grid-cols-2 gap-2">
            {r.photo_url && <figure className="flex flex-col gap-1"><img src={r.photo_url} alt="제보 사진" className="h-24 w-full rounded-lg object-cover" /><figcaption className="text-xs text-sub">제보 사진</figcaption></figure>}
            {r.after_photo_url && <figure className="flex flex-col gap-1"><img src={r.after_photo_url} alt="조치 후 사진" className="h-24 w-full rounded-lg object-cover" /><figcaption className="text-xs text-sub">조치 후 사진</figcaption></figure>}
          </div>
          {r.dept && <p className="text-xs text-sub">담당: {r.dept}</p>}
          {r.dept_note && <p className="rounded-lg bg-page px-3 py-2.5 text-[13px] leading-normal">{r.dept_note}</p>}
        </article>
      ))}
    </section>
  )
}
