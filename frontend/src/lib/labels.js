// 주민 화면에 보이는 결함 유형 이름. DB와 AI 분류값(constants.CATEGORIES)은 그대로 두고 화면에서만 바꾼다.
// 멘토·팀장 지적: '박리'는 일반 시민이 잘 쓰지 않는 말이다. 담당자(관리자) 화면은 전문 용어를 그대로 쓴다.
const PLAIN = {
  '콘크리트 균열': '콘크리트 갈라짐',
  '박리': '표면 벗겨짐',
  '백태/누수': '흰 얼룩·물 샘',
  '철근 노출': '철근이 드러남',
}

// 지도 필터에 쓰는 유형 목록 (분류가 없는 제보는 '기타'로 본다)
export const PLAIN_CATEGORIES = [...Object.values(PLAIN), '기타']
export const plainCategory = (category) => PLAIN[category] ?? category

// AI가 쓴 설명 문장 안의 용어도 같은 말로 바꾼다 (긴 말부터 바꿔 겹치지 않게). 뒤에 붙은 조사(가/이, 은/는 …)는 바뀐 말에 맞춘다.
const WORDS = [['콘크리트 균열', PLAIN['콘크리트 균열']], ['백태/누수', PLAIN['백태/누수']], ['철근 노출', PLAIN['철근 노출']],
  ['박리', PLAIN['박리']], ['백태', '흰 얼룩'], ['균열', '갈라짐']]
// [받침 있을 때, 없을 때]
const JOSA = { 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'],
  과: ['과', '와'], 와: ['과', '와'], 으로: ['으로', '로'], 로: ['으로', '로'] }
const finalConsonant = (word) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 ? code % 28 : 0 } // 0이면 받침 없음, 8이면 ㄹ
const josaFor = (josa, word) => { const f = finalConsonant(word); const [withB, without] = JOSA[josa]; return f === 0 || (f === 8 && withB === '으로') ? without : withB }
// 조사는 바로 뒤에 한글이 더 이어지지 않을 때만 조사로 본다 ('균열이나'의 '이'는 그대로 둔다)
export const plainText = (text) => (text ? WORDS.reduce((out, [from, to]) => out.replace(new RegExp(`${from}(?:(이|가|은|는|을|를|과|와|으로|로)(?![가-힣]))?`, 'g'), (_, j) => to + (j ? josaFor(j, to) : '')), text) : text)
