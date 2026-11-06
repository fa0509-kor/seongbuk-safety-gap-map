// 사진 품질 점검: 올리는 순간 브라우저에서 밝기와 선명도를 재서 '어둡다' '흔들렸다'를 알려 준다. 서버·AI 호출이 없어 비용이 들지 않는다.
// 경고만 하고 막지는 않는다 (주민이 그대로 보내도 됨).
// 기준값은 AI-Hub 조각 60장으로 맞춘 가정이다: 선명도(라플라시안 분산)가 20 미만이면 흔들림, 평균 밝기(0~255)가 60 미만이면 어두움.
// 같은 조각을 흐리게(반경 2) 만들면 60장 중 59장이 25 미만, 원본 60장 중 4장만 25 미만이었다(오경고 약 7%). 조각은 현장 전체 사진과 달라서
// 실제 폰 사진으로 기준값을 다시 맞춰야 한다. 표면이 매끈한 벽을 찍으면 선명한데도 '흔들림'으로 나올 수 있다.
export const BLUR_BELOW = 20
export const DARK_BELOW = 60
const WIDTH = 320 // 이 폭으로 줄여서 잰다 (속도와 노이즈 줄이기)

export async function checkPhotoQuality(blob) {
  try {
    const bmp = await createImageBitmap(blob)
    const w = Math.min(WIDTH, bmp.width)
    const h = Math.max(3, Math.round((bmp.height * w) / bmp.width))
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0, w, h)
    const px = ctx.getImageData(0, 0, w, h).data
    const g = new Float32Array(w * h)
    let sum = 0
    for (let i = 0; i < w * h; i += 1) { g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += g[i] }
    const brightness = sum / (w * h)
    let n = 0; let s = 0; let s2 = 0
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const lap = 4 * g[y * w + x] - g[y * w + x - 1] - g[y * w + x + 1] - g[(y - 1) * w + x] - g[(y + 1) * w + x]
        n += 1; s += lap; s2 += lap * lap
      }
    }
    const sharpness = s2 / n - (s / n) ** 2
    return { brightness: Math.round(brightness), sharpness: Math.round(sharpness), dark: brightness < DARK_BELOW, blurry: sharpness < BLUR_BELOW }
  } catch { return null } // 점검이 안 돼도 제보는 계속된다
}

export function qualityText(q) {
  if (!q || (!q.dark && !q.blurry)) return ''
  const what = q.dark && q.blurry ? '어둡고 흔들려' : q.dark ? '어두워' : '흔들려'
  return `사진이 ${what} 보여요. 다시 찍어 올리면 AI와 담당자가 더 정확히 볼 수 있어요. 그대로 보내도 됩니다.`
}
