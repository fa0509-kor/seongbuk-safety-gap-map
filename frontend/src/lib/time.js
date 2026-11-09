// 한국 시간으로 날짜·시간을 짧게 적는다 (내 제보 단계별 기록). 서버는 UTC로 내보내므로 브라우저 시간대와 상관없이 KST로 바꾼다.
const parts = (iso) => Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(iso)).map(({ type, value }) => [type, value]))
export function stepTime(iso) { // ['11.9', '14:18']
  if (!iso) return null
  const p = parts(iso)
  return [`${p.month}.${p.day}`, `${p.hour}:${p.minute}`]
}
export const dateTimeText = (iso) => { const t = stepTime(iso); return t ? `${t[0]} ${t[1]}` : '' }
