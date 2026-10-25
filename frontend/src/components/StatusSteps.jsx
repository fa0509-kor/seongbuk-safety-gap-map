const STEPS = [['received', '접수'], ['review', '검토'], ['action', '조치'], ['done', '완료']]

// 상태 진행 표시 (접수 → 검토 → 조치 → 완료). 와이어프레임 '내 제보'의 4칸 막대
export default function StatusSteps({ status }) {
  const current = STEPS.findIndex(([k]) => k === status)
  const color = status === 'done' ? 'bg-teal-700' : 'bg-brand'
  return (
    <ol className="grid grid-cols-4 gap-1">
      {STEPS.map(([key, label], i) => (
        <li key={key} className="flex flex-col items-center gap-1.5">
          <span className={`h-1.5 w-full rounded ${i <= current ? color : 'bg-gray-200'}`} />
          <span className={`text-xs ${i === current ? 'font-semibold' : ''}`}>{label}</span>
        </li>
      ))}
    </ol>
  )
}
