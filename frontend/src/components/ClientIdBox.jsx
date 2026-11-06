import { useState } from 'react'
import { myReports } from '../lib/myReports.js'

// 이 브라우저의 식별번호(앞 8자리)를 본인이 볼 수 있게 한다. 제보를 보낼 때 함께 저장되고, 담당자 화면에는 같은 8자리가 나온다.
// 이름·연락처가 아니라 브라우저가 만든 무작위 값이며, 같은 브라우저에서 반복·몰아서 올린 제보를 가려내는 데만 쓴다.
export default function ClientIdBox() {
  const code = myReports.clientCode() // 식별번호는 이 브라우저에서 바꿀 수 없다 (브라우저 데이터를 지우면 새 번호가 생김)
  const [msg, setMsg] = useState('')
  const [nick, setNick] = useState(() => myReports.nickname())
  const locked = !!myReports.nickname() // 한 번 정한 별명은 바꿀 수 없다 (제보마다 이름이 바뀌어 반복 제보를 가리기 어려워지는 것을 막음)
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">이 브라우저의 식별번호</span>
        <span className="rounded bg-page px-2 py-1 font-mono text-[15px] tracking-wider text-ink">{code}</span>
      </div>
      <p className="text-[13px] leading-snug text-sub">제보를 보낼 때 이 번호가 함께 저장돼요. 같은 브라우저에서 반복해서 올린 제보를 담당자가 가려내는 데만 쓰고, 이름이나 연락처가 아니라서 누구인지는 알 수 없어요. 브라우저 데이터를 지우면 새 번호가 생겨요.</p>
      {locked
        ? <p className="text-[13px] text-sub">별명 <strong className="text-ink">{nick}</strong> · 한 번 정하면 바꿀 수 없어요.</p>
        : (
          <label className="flex flex-col gap-1 text-[13px] text-sub">별명 (선택, 20자까지, 한 번 정하면 바꿀 수 없어요)
            <div className="flex gap-2">
              <input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder="예: 안암동 주민"
                className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-[15px] text-ink" />
              <button type="button" disabled={!nick.trim()} onClick={() => {
                if (!window.confirm(`별명을 "${nick.trim()}"(으)로 정할까요? 한 번 정하면 바꿀 수 없어요.`)) return
                myReports.setNickname(nick); setNick(myReports.nickname()); setMsg('별명을 저장했어요. 앱을 껐다 켜도 이 브라우저에서는 유지돼요.')
              }} className="h-11 shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-40">저장</button>
            </div>
            <span>실명이나 연락처는 쓰지 마세요. 담당자 화면에 이 별명이 보여요.</span>
          </label>
        )}
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  )
}
