const STEPS = [['received', '접수'], ['review', '검토'], ['action', '조치'], ['done', '완료']]

// 상태 진행 표시 (접수 → 검토 → 조치 → 완료)
export default function StatusSteps({ status }) {
  const current = STEPS.findIndex(([k]) => k === status)
  return (
    <ol className="flex gap-1 text-xs">
      {STEPS.map(([key, label], i) => (
        <li key={key} className={`flex-1 rounded py-1 text-center ${i <= current ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}>
          {label}
        </li>
      ))}
    </ol>
  )
}
