// 제보 화면 맨 위 진행 표시: 1 사진 → 2 위치 → 3 확인. 끝낸 단계는 짙은 남색 원에 체크, 지금 할 단계는 테두리가 있는 원, 아직인 단계는 회색 원.
// 원 안 숫자와 아래 글자를 크게 하고 단계 사이를 선으로 이어서 어디까지 했는지 한눈에 보이게 한다.
export default function StepBar({ steps }) {
  const current = steps.findIndex(([, done]) => !done) // 아직 안 끝난 첫 단계 (모두 끝났으면 -1)
  return (
    <ol className="flex items-start" aria-label="제보 진행 단계">
      {steps.map(([label, done], i) => {
        const now = i === current
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1" aria-current={now ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : steps[i - 1][1] ? 'bg-brand' : 'bg-gray-300'}`} />
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                done ? 'border-brand bg-brand text-white' : now ? 'border-brand bg-white text-brand' : 'border-gray-300 bg-gray-100 text-sub'}`}>
                {done
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                  : i + 1}
              </div>
              <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : done ? 'bg-brand' : 'bg-gray-300'}`} />
            </div>
            <span className={`text-sm ${done || now ? 'font-semibold text-ink' : 'text-sub'}`}>{label}{done ? ' 완료' : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}
