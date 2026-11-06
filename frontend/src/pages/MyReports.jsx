import Brand from '../components/Brand.jsx'
import { useEffect, useRef, useState } from 'react'
import StatusSteps from '../components/StatusSteps.jsx'
import { api } from '../lib/api.js'
import { formatTaken } from '../lib/exif.js'
import { myReports } from '../lib/myReports.js'

// 주민 4 내 제보: 상태 진행, 제보 사진과 조치 후 사진, 담당 부서 메모.
// 이 화면을 열면 '확인한 시각'을 저장해 하단바 빨간 점이 꺼진다.
// 화면을 열어 둔 채로 담당자가 처리해도 바뀌도록 15초마다, 그리고 다른 앱에서 돌아올 때 다시 불러온다
// (하단바 빨간 점 확인 주기와 같은 15초. 푸시 알림은 만들지 않음).
const REFRESH_MS = 15000

export default function MyReports() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const loaded = useRef(false)

  useEffect(() => {
    let alive = true
    const load = () => api.myReports(myReports.ids())
      .then((r) => {
        if (!alive) return
        setList(r)
        setError('')
        loaded.current = true
        // 새 소식이 있을 때만 확인 시각을 갱신 (매번 저장하면 하단바가 그때마다 다시 조회함)
        if (myReports.hasNews(r)) myReports.markSeen()
      })
      .catch((e) => { if (alive && !loaded.current) setError(e.message) }) // 이미 보이는 목록이 있으면 새로고침 실패는 조용히 넘김
    const onVisible = () => { if (document.visibilityState === 'visible') load() }

    load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  if (error) return <p className="p-5 text-danger">불러오기 실패: {error}</p>
  if (!list) return <p className="p-5">불러오는 중…</p>
  if (!list.length) return <section className="min-h-full bg-page p-5 pt-6"><header className="resident-header"><Brand /><h1>내 제보</h1></header><p className="mt-4 text-sub">아직 이 폰에서 보낸 제보가 없습니다.</p></section>

  // 접수 후 경과일, 완료까지 걸린 일수, 처리 대상 아님 사유 (리뷰: '처리 상황도 이유도 모른다'는 불만 대응)
  const days = (a, b = Date.now()) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
  const progress = (r) => {
    if (r.status === 'done') {
      const at = [...r.history].reverse().find((h) => h.to_status === 'done')?.at
      const n = at ? days(r.created_at, at) : null
      return n === null ? '조치 완료' : n === 0 ? '접수 당일 조치 완료' : `접수 후 ${n}일 만에 조치 완료`
    }
    const n = days(r.created_at)
    return n === 0 ? '오늘 접수' : `접수 후 ${n}일째`
  }
  const chip = (st, notTarget) => (notTarget ? 'bg-gray-200 text-sub' : st === 'done' ? 'bg-[#EBEFCB] text-brand' : st === 'received' ? 'bg-gray-200 text-ink' : 'bg-amber-100 text-amber-800')
  return (
    <section className="flex min-h-full flex-col gap-3.5 bg-page px-5 pb-6 pt-6 text-ink">
      <header className="resident-header"><Brand /><h1>내 제보</h1></header>
      <p className="text-sm text-sub">이 브라우저에서 보낸 제보 <strong className="text-brand">{list.length}건</strong></p>
      {list.map((r) => (
        <article key={r.public_id} className={`flex flex-col gap-3.5 rounded-2xl bg-white p-4 ${r.status === 'done' ? 'border-2 border-brand' : 'border border-line'}`}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">{r.ai?.category ?? '분류 없음'}{r.facility_label && ` · ${r.facility_label}`}</span>
              <span className="text-xs text-sub">{new Date(r.created_at).toLocaleDateString('ko-KR')} · 접수번호 {r.public_id}</span>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip(r.status, r.not_target)}`}>{r.not_target ? '처리 대상 아님' : (r.status_label ?? r.status)}</span>
          </div>
          {r.not_target
            ? <p className="rounded-lg bg-page px-3 py-2.5 text-[13px] leading-normal">담당자가 확인한 결과, 처리 대상이 아니라고 판단했습니다.{r.dept_note ? ` 이유: ${r.dept_note}` : ' 이유는 담당 부서에 문의해 주세요.'}</p>
            : <><StatusSteps status={r.status} /><p className="text-[13px] font-medium text-brand">{progress(r)}</p></>}
          <div className="grid grid-cols-2 gap-2">
            {(r.photos?.length ? r.photos : [{ photo_url: r.photo_url }]).filter((p) => p.photo_url).map((p, i) => (
              <figure key={p.photo_url} className="flex flex-col gap-1">
                <img src={p.photo_url} alt={i === 0 ? '제보 사진' : `제보 사진 ${i + 1}`} className="h-24 w-full rounded-lg object-cover" />
                <figcaption className="text-xs leading-snug text-sub">{i === 0 ? '제보 사진' : `사진 ${i + 1}`}{p.taken_at && ` · 촬영 ${formatTaken(p.taken_at)}`}{p.memo && <span className="block text-ink">{p.memo}</span>}</figcaption>
              </figure>
            ))}
            {r.after_photo_url && <figure className="flex flex-col gap-1"><img src={r.after_photo_url} alt="조치 후 사진" className="h-24 w-full rounded-lg object-cover" /><figcaption className="text-xs text-sub">조치 후 사진</figcaption></figure>}
          </div>
          {r.dept && <p className="text-xs text-sub">담당: {r.dept}</p>}
          {!r.not_target && r.dept_note && <p className="rounded-lg bg-page px-3 py-2.5 text-[13px] leading-normal">{r.dept_note}</p>}
        </article>
      ))}
    </section>
  )
}
