import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ResidentHeader, { residentAsset } from '../components/ResidentHeader.jsx'
import PhotoViewer from '../components/PhotoViewer.jsx'
import ProcessPicture from '../components/ProcessPicture.jsx'
import StatusSteps from '../components/StatusSteps.jsx'
import { api } from '../lib/api.js'
import { plainCategory } from '../lib/labels.js'
import { myReports } from '../lib/myReports.js'

// 홈 순서(11/9 팀 노션 기준): 제보 과정 그림 → 사진으로 제보하기 → 우리 동네 제보 현황 → 내 제보 → 안전왕 순위 → 지도(작게) → 서비스 안내 → 119
// 제보 현황은 담당자가 확인한 제보 기준이다. 확인을 기다리는 제보는 '확인 대기 N건'처럼 숫자로만 보이고, 사진·내용은 보이지 않는다.
const STATE_NAME = { review: '검토 중', action: '조치 중', done: '조치 완료' }
const MINI = [['review', '검토'], ['action', '조치'], ['done', '완료']]
// "옹벽·축대 표면 벗겨짐 · 보수 완료" 처럼 시설 + 결함 + 결과(또는 지금 단계)
const itemTitle = (it) => {
  const what = [it.facility_label && it.facility_label !== '모름' ? it.facility_label : null, plainCategory(it.category) ?? '기타'].filter(Boolean).join(' ')
  return `${what} · ${it.status === 'done' ? (it.result_label ?? STATE_NAME.done) : STATE_NAME[it.status] ?? it.status_label}`
}

export default function Home() {
  const [summary, setSummary] = useState(null) // GET /api/reports/summary
  const [error, setError] = useState(false)
  const [pairs, setPairs] = useState({})        // 조치 완료 제보 중 조치 전·후 사진이 둘 다 있는 것 {public_id: {before, after}}
  const [viewer, setViewer] = useState(null)    // 조치 전·후 사진 크게 보기 {before, after}
  const [mine, setMine] = useState(null) // 내 제보 (이 브라우저에서 보낸 것)
  const [rank, setRank] = useState(null) // 안전왕 순위 {top, me, total_players, points_per_report}
  const [rankAll, setRankAll] = useState(false) // 전체 순위 보기
  const [rankError, setRankError] = useState(false)
  useEffect(() => {
    api.reportsSummary(10).then((s) => {
      setSummary(s)
      // 완료된 제보의 사진은 공개 대상이다(지도의 조치 전·후 보기와 같다). 전·후 사진이 둘 다 있을 때만 버튼을 보여 준다
      const doneIds = s.recent.filter((it) => it.status === 'done').map((it) => it.public_id)
      if (doneIds.length) api.myReports(doneIds).then((rows) => setPairs(Object.fromEntries(rows
        .filter((r) => r.photo_url && r.after_photo_url).map((r) => [r.public_id, { before: r.photo_url, after: r.after_photo_url }])))).catch(() => {})
    }).catch(() => setError(true))
    const ids = myReports.ids()
    if (ids.length) api.myReports(ids, myReports.clientKey()).then(setMine).catch(() => setMine([]))
    else setMine([])
  }, [])

  // 순위: 처음엔 상위 5명, '전체 순위 보기'를 누르면 100명까지
  useEffect(() => {
    let alive = true
    api.ranking(rankAll ? 100 : 5, myReports.clientKey()).then((r) => alive && setRank(r)).catch(() => alive && setRankError(true))
    return () => { alive = false }
  }, [rankAll])

  const recent = useMemo(() => (summary?.recent ?? []).slice(0, 5), [summary])
  const myLatest = useMemo(() => (mine ?? []).filter((r) => !r.not_target)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 2), [mine])
  const inProgress = summary ? summary.review + summary.action : 0

  return (
    <section className="resident-screen resident-home">
      <ResidentHeader caption="우리 동네 안전 체크!" title="안전캐치" />
      <div className="flex flex-col gap-3 rounded-[20px] bg-[#ebefcb] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">제보하면 이렇게 처리돼요</h2>
          <Link to="/guide" className="grid min-h-[44px] shrink-0 place-items-center px-1 text-[13px] font-bold underline">자세히 보기</Link>
        </div>
        <ProcessPicture />
      </div>
      <Link to="/report" className="resident-primary flex items-center justify-center gap-2">
        <img src={residentAsset('home-imgCamera1.svg')} alt="" />사진으로 제보하기
      </Link>

      <div className="flex flex-col gap-3.5">
        <h2 className="text-lg font-bold">우리 동네 제보 현황</h2>
        {error ? <p className="text-sm text-sub">제보 현황을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
          : !summary ? <p role="status" className="text-sm text-sub">불러오는 중이에요.</p>
          : summary.reviewed_total + summary.pending === 0 ? <p className="text-sm text-sub">아직 접수된 제보가 없어요. 첫 제보를 남겨 주세요.</p>
          : <>
            <article className="resident-card flex flex-col gap-3">
              {summary.reviewed_total > 0 ? <>
                <p className="text-sm">담당자가 확인한 제보 <b className="text-xl">{summary.reviewed_total}건</b></p>
                <div className="flex h-3 overflow-hidden rounded-full bg-gray-200" role="img" aria-label={`검토·조치 중 ${inProgress}건, 조치 완료 ${summary.done}건`}>
                  {inProgress > 0 && <span style={{ width: `${(inProgress / summary.reviewed_total) * 100}%`, background: '#a7430d' }} />}
                  {summary.done > 0 && <span style={{ width: `${(summary.done / summary.reviewed_total) * 100}%`, background: '#bfd300' }} />}
                </div>
                <ul className="grid grid-cols-2 gap-2 text-center">
                  <li className="flex flex-col items-center gap-0.5"><span className="flex items-center gap-1 text-xs font-semibold"><span className="size-2 rounded-full" style={{ background: '#a7430d' }} />검토·조치 중</span><span className="text-lg font-bold">{inProgress}건</span></li>
                  <li className="flex flex-col items-center gap-0.5"><span className="flex items-center gap-1 text-xs font-semibold"><span className="size-2 rounded-full" style={{ background: '#bfd300' }} />조치 완료</span><span className="text-lg font-bold">{summary.done}건</span></li>
                </ul>
              </> : <p className="text-sm">아직 담당자가 확인한 제보가 없어요.</p>}
              <p className="border-t border-line pt-3 text-sm"><b>확인 대기 {summary.pending}건</b><span className="text-xs text-sub"> · 담당자가 확인하면 지도와 이 목록에 올라와요</span></p>
            </article>
            {recent.length > 0 && <article className="resident-card flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-sub">최근 확인된 제보</h3>
              <ul className="grid gap-3.5">
                {recent.map((it) => (
                  <li key={it.public_id} className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-bold leading-snug">{itemTitle(it)}</p>
                      {pairs[it.public_id] && <button type="button" onClick={() => setViewer(pairs[it.public_id])}
                        className="min-h-[44px] shrink-0 rounded-xl bg-brand px-3 text-[13px] font-bold leading-tight text-white">조치 사진<br />확인하기</button>}
                    </div>
                    <ol className="grid grid-cols-3 gap-1" aria-label="진행 단계">
                      {MINI.map(([k, label], i) => {
                        const now = MINI.findIndex(([key]) => key === it.status)
                        return <li key={k} className="flex flex-col items-center gap-1">
                          <span className={`h-1.5 w-full rounded ${i <= now ? 'bg-brand' : 'bg-gray-200'}`} />
                          <span className={`text-[11px] ${i === now ? 'font-bold' : 'text-sub'}`}>{label}</span>
                        </li>
                      })}
                    </ol>
                  </li>
                ))}
              </ul>
            </article>}
            {viewer && <PhotoViewer before={viewer.before} after={viewer.after} onClose={() => setViewer(null)} />}
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

      <section aria-label="안전왕 순위" className="flex flex-col gap-3.5">
        <h2 className="text-lg font-bold">우리 동네 안전왕</h2>
        <article className="resident-card flex flex-col gap-3">
          <p className="text-xs text-sub">담당자가 확인한 제보 1건에 {rank?.points_per_report ?? 10}점이에요. 제보를 보내기만 해서는 점수가 쌓이지 않아요. 점수는 순위에만 쓰이고, 포인트 교환은 준비 중이에요.</p>
          {rankError ? <p className="text-sm text-sub">순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
            : !rank ? <p role="status" className="text-sm text-sub">불러오는 중이에요.</p>
            : rank.top.length === 0 ? <p className="text-sm">아직 순위가 없어요. 제보가 확인되면 첫 안전왕이 될 수 있어요.</p>
            : <ol className="grid gap-1.5">
              {rank.top.map((row) => (
                <li key={`${row.rank}-${row.nickname}`} className={`flex min-h-[44px] items-center gap-2.5 rounded-xl px-2.5 ${row.is_me ? 'bg-[#ebefcb]' : ''}`}>
                  <span className="w-6 shrink-0 text-center text-base font-bold">{row.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.nickname}{row.is_me && <span className="ml-1.5 text-xs font-normal text-sub">(나)</span>}</span>
                  {row.title && <span className="resident-chip shrink-0 bg-accent text-ink">{row.title}</span>}
                  <span className="shrink-0 text-sm font-bold">{row.points}점</span>
                </li>
              ))}
            </ol>}
          {rank?.me && !rank.top.some((row) => row.is_me) && (
            <p className="rounded-xl bg-[#ebefcb] px-3 py-2.5 text-sm">내 순위 <b>{rank.me.rank}위</b> · {rank.me.points}점 ({rank.me.count}건)</p>
          )}
          {rank && rank.total_players > 5 && (
            <button type="button" onClick={() => setRankAll((v) => !v)} className="grid min-h-[44px] place-items-center text-sm font-semibold underline">
              {rankAll ? '상위 5명만 보기' : `전체 순위 보기 (${rank.total_players}명)`}
            </button>
          )}
        </article>
      </section>

      <Link to="/map" className="flex min-h-[52px] items-center justify-between rounded-[15px] border border-line bg-white px-4 text-sm font-bold">
        <span>지도에서 제보 위치 보기</span><img src={residentAsset('home-imgChev.svg')} alt="" />
      </Link>
      <Link to="/guide" className="flex min-h-[52px] items-center justify-between rounded-[15px] border border-line bg-white px-4 text-sm font-bold">
        서비스 안내 · 포인트와 봉사시간<img src={residentAsset('home-imgChev.svg')} alt="" />
      </Link>
      <a href="tel:119" className="flex min-h-[48px] items-center justify-between rounded-[15px] bg-danger px-4 text-[15px] font-bold text-white">
        <span>지금 위험하면 119</span><span className="text-[13px] underline">전화하기</span>
      </a>
    </section>
  )
}
