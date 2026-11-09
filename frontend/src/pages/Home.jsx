import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ResidentHeader, { residentAsset } from '../components/ResidentHeader.jsx'
import PhotoViewer from '../components/PhotoViewer.jsx'
import StatusSteps from '../components/StatusSteps.jsx'
import { api } from '../lib/api.js'
import { plainCategory } from '../lib/labels.js'
import { myReports } from '../lib/myReports.js'

// 홈 순서: 제보하기 → 우리 동네 안전 소식(건수·유형·최근 조치) → 내 제보 → 처리 과정 → 지도 열기 (멘토링 11/9: 소식을 위로, 지도를 아래로)
// 상태 색은 지도 범례와 같다 (MapPage COLORS)
// 홈에는 담당자가 검토를 시작한 제보만 센다(접수만 된 제보는 제외, 11/9 팀장 메모·멘토 피드백). 지도에는 접수 건도 그대로 나온다.
const BUCKETS = [['mid', '검토·조치 중', '#a7430d'], ['done', '조치 완료', '#bfd300']]
const bucketOf = (status) => (status === 'done' ? 'done' : status === 'review' || status === 'action' ? 'mid' : 'received')
const PROCESS = [
  ['접수', '사진을 올리면 바로 접수돼요. AI가 유형을 먼저 봐요.'],
  ['검토', '담당자가 사진을 보고 처리 대상인지 확인해요.'],
  ['조치', '담당 부서가 현장을 점검하고 고쳐요.'],
  ['완료', '조치 전·후 사진과 함께 알려드려요.'],
]

export default function Home() {
  const [features, setFeatures] = useState(null) // 지도에 올라간 제보 (체험용 제외)
  const [featured, setFeatured] = useState(null) // 최근 조치 완료 제보 중 조치 전·후 사진이 둘 다 있는 것 {category, before, after}
  const [viewer, setViewer] = useState(false)   // 조치 전·후 사진 크게 보기
  const [error, setError] = useState(false)
  const [mine, setMine] = useState(null) // 내 제보 (이 브라우저에서 보낸 것)
  useEffect(() => {
    api.reportsMap().then(({ features: list }) => {
      setFeatures(list)
      // 최근 조치 완료 8건 중 조치 전·후 사진이 모두 있는 첫 제보를 '조치 사진 확인하기'에 쓴다 (조치 완료 제보의 사진은 공개 대상이다, 지도의 조치 전·후 보기와 같다)
      const doneIds = list.filter(({ properties }) => properties.status === 'done')
        .sort((a, b) => b.properties.created_at.localeCompare(a.properties.created_at)).slice(0, 8).map(({ properties }) => properties.public_id)
      if (doneIds.length) api.myReports(doneIds).then((rows) => {
        const pair = doneIds.map((id) => rows.find((r) => r.public_id === id)).find((r) => r?.photo_url && r?.after_photo_url)
        if (pair) setFeatured({ category: pair.ai?.category, before: pair.photo_url, after: pair.after_photo_url })
      }).catch(() => {})
    }).catch(() => setError(true))
    const ids = myReports.ids()
    if (ids.length) api.myReports(ids, myReports.clientKey()).then(setMine).catch(() => setMine([]))
    else setMine([])
  }, [])

  const summary = useMemo(() => {
    if (!features) return null
    const count = { mid: 0, done: 0 }
    const byType = new Map()
    const reviewed = features.filter(({ properties: p }) => bucketOf(p.status) !== 'received')
    reviewed.forEach(({ properties: p }) => {
      count[bucketOf(p.status)] += 1
      const name = plainCategory(p.category) ?? '기타'
      byType.set(name, (byType.get(name) ?? 0) + 1)
    })
    const types = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const latest = features.filter(({ properties }) => properties.status === 'done')
      .sort((a, b) => b.properties.created_at.localeCompare(a.properties.created_at))[0]?.properties ?? null
    return { total: reviewed.length, count, types, latest }
  }, [features])

  const myLatest = useMemo(() => (mine ?? []).filter((r) => !r.not_target)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 2), [mine])

  return (
    <section className="resident-screen resident-home">
      <ResidentHeader caption="우리 동네 안전 체크!" title="성북 안전 공백 지도" />
      <Link to="/report" className="resident-primary flex items-center justify-center gap-2">
        <img src={residentAsset('home-imgCamera1.svg')} alt="" />사진으로 제보하기
      </Link>

      <div className="flex flex-col gap-3.5">
        <h2 className="text-lg font-bold">우리 동네 안전 소식</h2>
        {error ? <p className="text-sm text-sub">안전 소식을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
          : !summary ? <p role="status" className="text-sm text-sub">불러오는 중이에요.</p>
          : summary.total === 0 ? <p className="text-sm text-sub">아직 담당자가 확인한 제보가 없어요. 제보하면 담당자가 확인한 뒤 여기에 나와요.</p>
          : <>
            <article className="resident-card flex flex-col gap-3">
              <p className="text-sm">주민이 알리고 담당자가 확인한 위험 <b className="text-xl">{summary.total}건</b></p>
              <div className="flex h-3 overflow-hidden rounded-full bg-gray-200" role="img"
                aria-label={BUCKETS.map(([k, label]) => `${label} ${summary.count[k]}건`).join(', ')}>
                {BUCKETS.map(([k, , color]) => summary.count[k] > 0 && <span key={k} style={{ width: `${(summary.count[k] / summary.total) * 100}%`, background: color }} />)}
              </div>
              <ul className="grid grid-cols-2 gap-2 text-center">
                {BUCKETS.map(([k, label, color]) => (
                  <li key={k} className="flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1 text-xs font-semibold"><span className="size-2 rounded-full" style={{ background: color }} />{label}</span>
                    <span className="text-lg font-bold">{summary.count[k]}건</span>
                  </li>
                ))}
              </ul>
              {summary.types.length > 0 && <div className="border-t border-line pt-3">
                <h3 className="text-xs font-semibold text-sub">많이 알려진 위험</h3>
                <ul className="mt-1.5 grid gap-1">
                  {summary.types.map(([name, n]) => <li key={name} className="flex justify-between text-sm"><span>{name}</span><b>{n}건</b></li>)}
                </ul>
              </div>}
            </article>
            {summary.latest && <article className="resident-card flex items-center justify-between gap-3">
              <div className="min-w-0">
              <span className="resident-chip bg-[#e5f4ec] text-[#166548]">최근 조치 완료</span>
              <h3 className="mt-2 font-bold">{plainCategory(featured?.category ?? summary.latest.category) ?? '주민 제보'} 조치 완료</h3>
              <p className="mt-2 text-xs text-sub">주민 제보로 발견한 위험을 정리했어요.</p>
            </div>
            {featured && <button type="button" onClick={() => setViewer(true)} className="min-h-[56px] shrink-0 rounded-xl bg-brand px-3.5 text-[13px] font-bold leading-tight text-white">조치 사진<br />확인하기</button>}
            </article>}
            {viewer && featured && <PhotoViewer before={featured.before} after={featured.after} onClose={() => setViewer(false)} />}
          </>}
      </div>

      <div className="flex flex-col gap-3.5">
        <h2 className="text-lg font-bold">내 제보는 어디까지 왔나요?</h2>
        {mine === null ? <p role="status" className="text-sm text-sub">불러오는 중이에요.</p>
          : myLatest.length === 0 ? <p className="text-sm text-sub">제보를 보내면 여기에서 처리 단계를 바로 볼 수 있어요.</p>
          : <>
            {myLatest.map((r) => (
              <article key={r.public_id} className="resident-card flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{plainCategory(r.ai?.category) ?? '분류 없음'}{r.facility_label && ` · ${r.facility_label}`}</span>
                  <span className="shrink-0 text-xs text-sub">{new Date(r.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
                <StatusSteps status={r.status} />
              </article>
            ))}
            <Link to="/my" className="grid min-h-[44px] place-items-center text-sm font-semibold underline">내 제보 모두 보기</Link>
          </>}
      </div>

      <section aria-label="처리 과정" className="rounded-[20px] bg-[#ebefcb] p-3.5">
        <h2 className="text-lg font-bold">제보하면 이렇게 처리돼요</h2>
        <ol className="mt-3 grid gap-2.5">
          {PROCESS.map(([title, text], i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
              <p className="text-sm leading-snug"><b>{title}</b> · {text}</p>
            </li>
          ))}
        </ol>
      </section>

      <Link to="/map" className="rounded-[20px] bg-[#ebefcb] p-3.5">
        <span className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-bold">성북구 · 지도 예시</span>
        <h2 className="my-3 text-lg font-bold">내 주변에 어떤 제보가 있나요?</h2>
        <div className="relative">
          <img src={residentAsset('home-img.png')} alt="성북구 지도 예시" className="h-[180px] w-full rounded-[13px] object-cover" />
          {[[27, 35, '#001a47'], [51, 55, '#a7430d'], [76, 38, '#166548']].map(([x, y, color]) => (
            <span key={color} className="absolute grid size-7 -translate-1/2 place-items-center rounded-full" style={{ left: x + '%', top: y + '%', background: color }}>
              <img src={residentAsset('home-imgPin.svg')} alt="" />
            </span>
          ))}
        </div>
        <span className="mt-2.5 flex items-center justify-between text-sm font-bold">지도에서 다른 제보 보기<img src={residentAsset('home-imgChev.svg')} alt="" /></span>
        <span className="mt-1 block text-xs text-sub">제보 위치와 처리 상황을 지도로 볼 수 있어요.</span>
      </Link>
    </section>
  )
}
