// 규칙이 매긴 점수 (backend/app/scoring.py). 항목별로 펼쳐서 '왜 이 순서인지' 보여 준다. AI 점수가 아님.
export default function PriorityCard({ priority }) {
  if (!priority) return null
  const { total, items, urgent, due_at: dueAt, overdue } = priority
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{total}</span><span className="text-sm text-gray-500">점</span>
        {urgent && <span className="rounded bg-danger px-2 text-xs text-white">우선</span>}
        {priority.needs_review && <span className="rounded bg-amber-100 px-2 text-xs text-amber-800">AI 불확실 · 확인 필요</span>}
      </div>
      <ul className="divide-y rounded border text-sm">
        {items.map((i) => (
          <li key={i.label} className="flex justify-between gap-2 p-2">
            <span>{i.label}{i.note && <span className="block text-xs text-gray-500">{i.note}</span>}</span>
            <span className="font-mono">{i.points > 0 ? `+${i.points}` : i.points}</span>
          </li>
        ))}
      </ul>
      {dueAt
        ? <p className={`text-sm ${overdue ? 'font-semibold text-danger' : 'text-gray-600'}`}>
            조치 기한 {new Date(dueAt).toLocaleDateString('ko-KR')}{overdue && ' · 기한 초과'}
          </p>
        : <p className="text-xs text-gray-500">공백 후보는 조치 기한 없음</p>}
      <p className="text-xs text-gray-400">점수 값은 팀 가정값 v1 (docs/decisions.md)</p>
    </div>
  )
}
