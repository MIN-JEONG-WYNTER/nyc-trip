// 직선거리 기반 이동시간 추정 (외부 API 없음).
// 맨해튼 격자 도로를 감안해 직선거리에 1.3을 곱하고, 도보와 지하철 중 빠른 쪽을 고른다.
const DETOUR = 1.3;
const WALK_KMH = 4.8;
const SUBWAY_KMH = 22;
const SUBWAY_OVERHEAD = 10; // 역까지 걷기 + 대기

export function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function travel(a, b) {
  const km = distanceKm(a, b) * DETOUR;
  if (km < 0.08) return { min: 0, mode: "none", km };
  const walk = (km / WALK_KMH) * 60;
  const subway = SUBWAY_OVERHEAD + (km / SUBWAY_KMH) * 60;
  if (walk <= 15 || walk <= subway) return { min: Math.max(3, Math.round(walk)), mode: "walk", km };
  return { min: Math.round(subway), mode: "subway", km };
}
