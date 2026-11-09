import { stepTime } from '../lib/time.js'

const STEPS = [['received', '접수'], ['review', '검토'], ['action', '조치'], ['done', '완료']]

// 상태 진행 표시 (접수 → 검토 → 조치 → 완료). 와이어프레임 '내 제보'의 4칸 막대
// times: 단계별로 그 상태가 된 시각 {received, review, action, done} (ISO). 있으면 단계 이름 아래에 날짜와 시간을 적는다
export default function StatusSteps({ status, times }) {
  const current = STEPS.findIndex(([k]) => k === status)
  const color = 'bg-brand'
  return (
    <ol className="grid grid-cols-4 gap-1">
      {STEPS.map(([key, label], i) => (
        <li key={key} className="flex flex-col items-center gap-1.5">
          <span className={`h-1.5 w-full rounded ${i <= current ? color : 'bg-gray-200'}`} />
          <span className={`text-[13px] ${i === current ? 'font-semibold' : ''}`}>{label}</span>
          {times && <span className="min-h-[30px] text-center text-[11px] leading-tight text-sub">
            {stepTime(times[key])?.map((line) => <span key={line} className="block">{line}</span>) ?? <span aria-label="아직 아님">-</span>}
          </span>}
        </li>
      ))}
    </ol>
  )
}
