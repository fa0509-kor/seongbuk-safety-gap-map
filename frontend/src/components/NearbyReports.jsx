import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { myReports } from '../lib/myReports.js'
import { plainCategory } from '../lib/labels.js'

// 제보 화면: 같은 곳(기본 50m, 폰 위치 정확도가 나쁘면 더 넓게)에 이미 있는 제보를 먼저 보여 준다 (중복 제보 줄이기, 사후 관리).
//  - 진행 중: '나도 봤어요'로 확인만 남기고, 그 제보를 내 제보에서 따라본다.
//  - 조치 완료 후 14일 이내(가정): 새 제보 대신 '고쳐졌어요 / 아직 그대로예요'로 알린다. 아직 그대로가 쌓이면 담당자가 다시 확인한다.
//  - 그보다 오래전에 조치된 곳: 다시 생겼다면 새로 제보하면 되고, 같은 곳의 재발로 기록된다.
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

export default function NearbyReports({ pos, category, accuracy }) {
  const [list, setList] = useState([])
  const [msg, setMsg] = useState('')
  const [, bump] = useState(0)

  useEffect(() => {
    if (!pos) { setList([]); return }
    let alive = true
    const t = setTimeout(() => {
      api.nearby(pos.lat, pos.lon, category, accuracy).then((r) => alive && setList(r)).catch(() => alive && setList([]))
    }, 400) // 핀을 끄는 동안 계속 부르지 않도록
    return () => { alive = false; clearTimeout(t) }
  }, [pos?.lat, pos?.lon, category, accuracy])

  async function confirm(id) {
    try {
      await api.confirm(id)
      myReports.markConfirmed(id)
      myReports.add(id) // 내 제보에서 진행 상황을 따라볼 수 있게
      setMsg("확인했어요. 이 제보의 진행 상황은 '내 제보'에서 볼 수 있습니다.")
      bump((n) => n + 1)
    } catch (e) { setMsg(`실패: ${e.message}`) }
  }

  async function vote(id, kind) {
    try {
      const out = await api.feedback(id, kind, myReports.clientKey())
      myReports.setVote(id, kind)
      myReports.add(id)
      setList((l) => l.map((x) => (x.public_id === id ? { ...x, fixed: out.aftercare.fixed, not_fixed: out.aftercare.not_fixed } : x)))
      setMsg(kind === 'not_fixed'
        ? "알려 주셔서 고맙습니다. '아직 그대로'라는 의견이 모이면 담당자가 다시 확인합니다. 새로 제보하지 않아도 됩니다."
        : '알려 주셔서 고맙습니다. 고쳐진 것으로 기록했어요.')
    } catch (e) { setMsg(`실패: ${e.message}`) }
  }

  if (!list.length) return null
  const active = list.filter((r) => r.state !== 'old_done')
  const title = active.length ? `이 근처에 이미 접수된 제보가 ${active.length}건 있어요` : '이 근처에서 전에 조치된 곳이 있어요'
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[13px] text-sub">같은 문제라면 새로 보내지 않고 아래에서 알려 주세요. 다른 문제라면 그대로 제보하시면 됩니다.</p>
      {list.map((r) => {
        const mine = myReports.vote(r.public_id)
        return (
          <div key={r.public_id} className="flex flex-col gap-2 rounded-lg bg-page px-3 py-2">
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">{plainCategory(r.category) ?? '분류 없음'}{r.facility_label && ` · ${r.facility_label}`}</span>
              {r.state === 'open' && (
                <span className="text-[13px] text-sub">{r.status_label} · 접수 후 {daysSince(r.created_at)}일째 · 약 {r.distance_m}m · 확인 {r.confirm_count}명{r.dept && ` · ${r.dept}`}</span>
              )}
              {r.state === 'recent_done' && (
                <span className="text-[13px] text-sub">{r.done_days_ago === 0 ? '오늘' : `${r.done_days_ago}일 전`} 조치 완료 · 약 {r.distance_m}m · 고쳐졌어요 {r.fixed}명, 아직 그대로 {r.not_fixed}명</span>
              )}
              {r.state === 'old_done' && (
                <span className="text-[13px] text-sub">{r.done_days_ago}일 전에 조치된 곳이에요 · 약 {r.distance_m}m. 다시 생겼다면 아래에서 새로 제보해 주세요. 같은 곳의 재발로 담당자에게 전달됩니다.</span>
              )}
            </div>
            {r.state === 'open' && (
              <button type="button" disabled={myReports.confirmed(r.public_id) || myReports.ids().includes(r.public_id)}
                onClick={() => confirm(r.public_id)}
                className="h-11 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white disabled:opacity-40">
                {myReports.confirmed(r.public_id) ? '확인했어요' : '나도 봤어요'}
              </button>
            )}
            {r.state === 'recent_done' && (
              <div className="grid grid-cols-2 gap-2">
                {[['fixed', '고쳐졌어요'], ['not_fixed', '아직 그대로예요']].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => vote(r.public_id, k)} aria-pressed={mine === k}
                    className={`h-11 rounded-lg border text-sm font-semibold ${mine === k ? 'border-brand bg-brand text-white' : 'border-brand bg-white text-brand'}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  )
}
