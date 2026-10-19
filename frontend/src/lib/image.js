// 폰 사진은 4.5MB(Vercel 요청 한도)를 넘기 쉬워서 올리기 전에 긴 변 1600px JPEG로 줄인다.
export async function resizeImage(file, maxSide = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file) // 최신 브라우저는 EXIF 회전을 반영함
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// 현재 위치. https(배포 주소)나 localhost에서만 동작하고, 실패하면 null.
export function currentPosition(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout },
    )
  })
}
