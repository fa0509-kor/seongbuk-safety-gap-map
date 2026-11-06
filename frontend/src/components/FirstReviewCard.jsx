// 담당자 대시보드: 접수한 제보를 처음 확인하기까지 걸린 시간. 12주 실증에서 볼 지표의 하나다.
// '첫 확인'은 접수에서 다른 상태(검토·조치·완료)로 처음 바뀐 시점이고, 메모만 남긴 것은 세지 않는다 (backend/app/review_time.py).
const hours = (h) => (h == null ? '-' : h >= 48 ? `${(h / 24).toFixed(1)}일` : `${h}시간`)

export default function FirstReviewCard({ fr }) {
  if (!fr || (!fr.count && !fr.waiting)) return null
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">첫 확인까지 걸린 시간 · 접수한 제보를 담당자가 얼마나 빨리 보기 시작하는지</div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><div className="text-xs text-gray-500">평균</div><div className="text-xl font-semibold">{hours(fr.avg_hours)}</div></div>
        <div><div className="text-xs text-gray-500">중앙값</div><div className="text-xl font-semibold">{hours(fr.median_hours)}</div></div>
        <div><div className="text-xs text-gray-500">24시간 안에 확인</div><div className="text-xl font-semibold">{fr.within_24h_pct == null ? '-' : `${fr.within_24h_pct}%`}</div></div>
        <div><div className="text-xs text-gray-500">확인 대기 중</div><div className="text-xl font-semibold">{fr.waiting}건</div>{fr.oldest_waiting_hours != null && <div className="text-xs text-gray-500">가장 오래 {hours(fr.oldest_waiting_hours)}</div>}</div>
      </div>
      <p className="mt-2 text-xs text-gray-400">확인된 제보 {fr.count}건 기준. 체험·오탐 제외.</p>
    </div>
  )
}
