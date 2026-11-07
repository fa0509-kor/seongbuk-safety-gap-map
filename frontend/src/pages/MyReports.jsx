import ResidentHeader, { residentAsset } from '../components/ResidentHeader.jsx'
import { useEffect, useRef, useState } from 'react'
import BeforeAfter from '../components/BeforeAfter.jsx'
import ClientIdBox from '../components/ClientIdBox.jsx'
import StatusSteps from '../components/StatusSteps.jsx'
import { api } from '../lib/api.js'
import { formatTaken } from '../lib/exif.js'
import { myReports } from '../lib/myReports.js'

// 주민 4 내 제보: 상태 진행, 조치 전·후 비교, 조치 결과 확인(고쳐졌어요/아직 그대로예요), 재발 안내, 처리 이력, 담당 부서 메모.
// 이 화면을 열면 '확인한 시각'을 저장해 하단바 빨간 점이 꺼진다.
// 화면을 열어 둔 채로 담당자가 처리해도 바뀌도록 15초마다, 그리고 다른 앱에서 돌아올 때 다시 불러온다
// (하단바 빨간 점 확인 주기와 같은 15초. 푸시 알림은 만들지 않음).
const REFRESH_MS = 15000

export default function MyReports() {
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [voteMsg, setVoteMsg] = useState({})
  const loaded = useRef(false)

  useEffect(() => {
    let alive = true
    const load = () => api.myReports(myReports.ids(), myReports.clientKey())
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

  async function cancel(r) {
    if (!window.confirm('이 제보를 취소할까요? 취소하면 제보와 사진이 삭제되고 되돌릴 수 없어요.')) return
    try {
      await api.cancelReport(r.public_id, myReports.clientKey())
      myReports.remove(r.public_id)
      setList((l) => l.filter((x) => x.public_id !== r.public_id))
    } catch (e) { setVoteMsg((m) => ({ ...m, [r.public_id]: e.message })) }
  }

  async function vote(r, kind) {
    try {
      const out = await api.feedback(r.public_id, kind, myReports.clientKey())
      myReports.setVote(r.public_id, kind)
      setList((l) => l.map((x) => (x.public_id === r.public_id ? out : x)))
      setVoteMsg((m) => ({ ...m, [r.public_id]: kind === 'not_fixed'
        ? "알려 주셔서 고맙습니다. '아직 그대로'라는 의견이 모이면 담당자가 다시 확인합니다."
        : '알려 주셔서 고맙습니다. 고쳐진 것으로 기록했어요.' }))
    } catch (e) { setVoteMsg((m) => ({ ...m, [r.public_id]: `실패: ${e.message}` })) }
  }

  if (error) return <p className="p-5 text-danger">불러오기 실패: {error}</p>
  if (!list) return <p className="p-5">불러오는 중…</p>
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
  // 처리 이력: 상태가 바뀐 날짜와 시스템이 남긴 재발 기록만 보여 준다 (담당자가 적은 내부 메모는 보이지 않음)
  const timeline = (r) => r.history
    .filter((h) => h.from_status !== h.to_status || (h.note ?? '').includes('재발'))
    .map((h) => ({ at: h.at, text: h.from_status === h.to_status ? h.note : h.to_status_label }))
  const chip = (st, notTarget) => (notTarget ? 'bg-gray-200 text-sub' : st === 'done' ? 'bg-[#EBEFCB] text-brand' : st === 'received' ? 'bg-gray-200 text-ink' : 'bg-amber-100 text-amber-800')
  return (
    <section className="resident-screen">
      <ResidentHeader caption="접수부터 완료까지" title="내 제보" />
      <div className="relative min-h-[129px] overflow-hidden rounded-[20px] bg-[#ebefcb] p-4">
        <img src={residentAsset('my-img.png')} alt="" className="absolute right-3 top-2 size-[112px] object-contain" />
        <p className="relative text-[13px] font-semibold text-sub">내가 보낸 제보</p>
        <p className="relative my-2 text-[28px] font-bold">{list.length}건</p>
        <p className="relative max-w-[66%] text-xs text-sub">이 브라우저에서 보낸 제보를 확인해요.</p>
      </div>
      {!list.length && <p className="resident-card text-sm text-sub">아직 이 브라우저에서 보낸 제보가 없어요.</p>}
      {list.map((r) => {
        const ac = r.aftercare ?? { fixed: 0, not_fixed: 0, recurrence: null }
        const mine = myReports.vote(r.public_id)
        const photos = (r.photos?.length ? r.photos : [{ photo_url: r.photo_url }]).filter((p) => p.photo_url)
        const compare = r.photo_url && r.after_photo_url // 조치 후 사진이 올라오면 완료 처리 전이라도 바로 전·후를 비교해 볼 수 있게
        return (
          <article key={r.public_id} className="resident-card flex flex-col gap-3.5">
            <div className="flex flex-col items-start gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${chip(r.status, r.not_target)}`}>{r.not_target ? '처리 대상 아님' : (r.status_label ?? r.status)}</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-lg font-bold leading-snug">{r.ai?.category ?? '분류 없음'}{r.facility_label && ` · ${r.facility_label}`}</span>
                <span className="text-[13px] text-sub">{new Date(r.created_at).toLocaleDateString('ko-KR')} · 접수번호 {r.public_id}</span>
              </div>
            </div>
            {r.not_target
              ? <p className="rounded-lg bg-page px-3 py-2.5 text-sm leading-normal">담당자가 확인한 결과, 처리 대상이 아니라고 판단했습니다.{r.dept_note ? ` 이유: ${r.dept_note}` : ' 이유는 담당 부서에 문의해 주세요.'}</p>
              : <><StatusSteps status={r.status} /><p className="text-sm font-medium text-brand">{progress(r)}</p></>}
            {ac.recurrence && (
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm leading-normal">같은 곳에서 조치된 지 {ac.recurrence.days_after_done}일 만에 다시 제보된 곳이에요. 재발로 담당자에게 전달됩니다.</p>
            )}
            {compare && <BeforeAfter before={r.photo_url} after={r.after_photo_url} />}
            <div className="grid grid-cols-2 gap-2">
              {photos.filter((_, i) => !(compare && i === 0)).map((p, i) => (
                <figure key={p.photo_url} className="flex flex-col gap-1">
                  <img src={p.photo_url} alt={`제보 사진 ${i + 1}`} className="h-24 w-full rounded-lg object-cover" />
                  <figcaption className="text-[13px] leading-snug text-sub">{p.taken_at ? `촬영 ${formatTaken(p.taken_at)}` : '제보 사진'}{p.memo && <span className="block text-ink">{p.memo}</span>}</figcaption>
                </figure>
              ))}
              {!compare && r.after_photo_url && <figure className="flex flex-col gap-1"><img src={r.after_photo_url} alt="조치 후 사진" className="h-24 w-full rounded-lg object-cover" /><figcaption className="text-[13px] text-sub">조치 후 사진</figcaption></figure>}
            </div>
            {r.status === 'done' && !r.not_target && (
              <div className="flex flex-col gap-2 rounded-lg bg-page p-3">
                <p className="text-sm font-semibold">조치 결과가 맞나요?</p>
                <div className="grid grid-cols-2 gap-2">
                  {[['fixed', '고쳐졌어요'], ['not_fixed', '아직 그대로예요']].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => vote(r, k)} aria-pressed={mine === k}
                      className={`h-11 rounded-lg border text-sm font-semibold ${mine === k ? 'border-brand bg-brand text-white' : 'border-brand bg-white text-brand'}`}>{label}</button>
                  ))}
                </div>
                <p className="text-[13px] text-sub">주민 확인: 고쳐졌어요 {ac.fixed}명 · 아직 그대로 {ac.not_fixed}명</p>
                {voteMsg[r.public_id] && <p className="text-[13px] text-ink">{voteMsg[r.public_id]}</p>}
              </div>
            )}
            {r.status === 'received' && !r.not_target && (
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => cancel(r)} className="h-11 self-start rounded-lg border border-line px-3 text-[13px] font-medium text-danger">제보 취소하기</button>
                {voteMsg[r.public_id] && <p className="text-[13px] text-sub">{voteMsg[r.public_id]}</p>}
              </div>
            )}
            {(r.dept || (!r.not_target && r.dept_note)) && (
              <div className="rounded-lg bg-page px-3 py-2.5 text-sm leading-normal">
                <p className="text-[13px] font-semibold text-sub">담당 부서{r.dept && ` · ${r.dept}`}</p>
                {!r.not_target && r.dept_note && <p className="mt-1">{r.dept_note}</p>}
              </div>
            )}
            {timeline(r).length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer py-1 font-medium text-brand">처리 이력 보기</summary>
                <ol className="mt-1.5 flex flex-col gap-1 border-l-2 border-line pl-3">
                  {timeline(r).map((t, i) => (
                    <li key={i} className="text-[13px] leading-snug"><span className="text-sub">{new Date(t.at).toLocaleDateString('ko-KR')}</span> · {t.text}</li>
                  ))}
                </ol>
              </details>
            )}
          </article>
        )
      })}
      <ClientIdBox />
    </section>
  )
}
