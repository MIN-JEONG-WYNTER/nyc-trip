// 뉴욕 동네 구분 (문장 요청의 동네 이름, "하루 한 동네" 옵션에 쓰임)
import { distanceKm } from "./geo.js";

// 동네: 중심 좌표와 반경(km)
export const AREAS = {
  soho: { label: "소호", words: ["소호", "soho"], c: [40.7233, -74.001], r: 0.55 },
  noho: { label: "노호", words: ["노호", "noho"], c: [40.728, -73.9925], r: 0.4 },
  nolita: { label: "놀리타", words: ["놀리타", "nolita", "리틀이태리", "little italy"], c: [40.722, -73.9965], r: 0.4 },
  les: { label: "로어이스트사이드", words: ["로어이스트", "lower east", "les"], c: [40.718, -73.987], r: 0.6 },
  eastvillage: { label: "이스트빌리지", words: ["이스트빌리지", "이스트 빌리지", "east village"], c: [40.7265, -73.984], r: 0.6 },
  westvillage: { label: "웨스트빌리지", words: ["웨스트빌리지", "웨스트 빌리지", "west village", "그리니치", "greenwich"], c: [40.734, -74.003], r: 0.65 },
  chelsea: { label: "첼시", words: ["첼시", "chelsea", "미트패킹", "meatpacking", "하이라인", "high line"], c: [40.744, -74.003], r: 0.75 },
  flatiron: { label: "플랫아이언", words: ["플랫아이언", "flatiron", "유니언스퀘어", "union square", "노매드", "nomad"], c: [40.7405, -73.9895], r: 0.6 },
  ktown: { label: "코리아타운", words: ["코리아타운", "한인타운", "k타운", "ktown", "koreatown"], c: [40.7475, -73.9865], r: 0.3 },
  midtown: { label: "미드타운", words: ["미드타운", "midtown", "타임스퀘어", "타임스 스퀘어", "times square", "록펠러", "그랜드센트럴", "5번가", "피프스"], c: [40.756, -73.982], r: 1.3 },
  uws: { label: "어퍼웨스트", words: ["어퍼웨스트", "어퍼 웨스트", "upper west"], c: [40.787, -73.9754], r: 1.1 },
  ues: { label: "어퍼이스트", words: ["어퍼이스트", "어퍼 이스트", "upper east"], c: [40.7736, -73.9566], r: 1.1 },
  centralpark: { label: "센트럴파크", words: ["센트럴파크", "센트럴 파크", "central park"], c: [40.7812, -73.9665], r: 1.6 },
  downtown: { label: "다운타운", words: ["다운타운", "로어맨해튼", "로어 맨해튼", "월스트리트", "월가", "fidi", "downtown", "트라이베카", "tribeca"], c: [40.7105, -74.0095], r: 0.9 },
  dumbo: { label: "덤보", words: ["덤보", "dumbo"], c: [40.7033, -73.9881], r: 0.5 },
  williamsburg: { label: "윌리엄스버그", words: ["윌리엄스버그", "williamsburg", "그린포인트", "greenpoint"], c: [40.718, -73.955], r: 1.4 },
  // 브루클린은 큰 원으로 잡으면 맨해튼 다운타운까지 들어가서, 동네 여러 곳의 중심(1.4km)으로 판단한다
  brooklyn: {
    label: "브루클린", words: ["브루클린", "brooklyn"], c: [40.69, -73.97], r: 1.4,
    centers: [[40.7015, -73.9895], [40.6935, -73.987], [40.6955, -73.9945], [40.7185, -73.9565], [40.73, -73.9515], [40.6755, -73.9785], [40.6865, -73.9775]],
  },
};

// 문장에 동네 이름이 있는지 — 영문 단어는 단어 경계가 있어야 인정 ("les"가 "lesson"에 걸리지 않게)
const LATIN = /^[a-z0-9 .'-]+$/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD_RE = {};
export function hasAreaWord(text, key) {
  const lower = text.toLowerCase();
  return AREAS[key].words.some((w) => {
    if (!LATIN.test(w)) return lower.includes(w);
    WORD_RE[w] ||= new RegExp(`(?<![a-z0-9])${esc(w).replace(/ /g, "\\s*")}(?![a-z0-9])`, "i");
    return WORD_RE[w].test(lower);
  });
}
export const findArea = (text) => Object.keys(AREAS).find((k) => hasAreaWord(text, k)) || null;

// 장소가 속한 동네: 반경 대비 가장 가까운 동네 (브루클린 전체처럼 넓은 구역은 제외)
const FINE = Object.keys(AREAS).filter((k) => k !== "brooklyn");
export function areaOf(loc) {
  let best = null;
  let bestScore = Infinity;
  for (const k of FINE) {
    const a = AREAS[k];
    const score = distanceKm(loc, { lat: a.c[0], lon: a.c[1] }) / a.r;
    if (score < bestScore) [best, bestScore] = [k, score];
  }
  return best;
}

// 하루 일정을 짤 때 쓰는 큰 권역 — 걸어서 이어지는 동네끼리 묶었다. 하루에 권역 1~2개만 간다.
export const DISTRICTS = {
  downtown: { label: "다운타운", c: [40.7085, -74.0105] }, // FiDi·트라이베카·배터리파크·WTC
  soho: { label: "소호·노호·놀리타", c: [40.7225, -73.9985] }, // 리틀이태리·로어이스트 일부
  westvillage: { label: "웨스트빌리지", c: [40.734, -74.0035] },
  eastvillage: { label: "이스트빌리지·LES", c: [40.7235, -73.986] },
  chelsea: { label: "첼시·미트패킹", c: [40.7445, -74.0045] },
  flatiron: { label: "플랫아이언·코리아타운", c: [40.7435, -73.988] },
  midtown: { label: "미드타운", c: [40.7585, -73.9805] },
  uws: { label: "어퍼웨스트", c: [40.783, -73.9745] },
  ues: { label: "어퍼이스트", c: [40.7755, -73.9615] },
  dumbo: { label: "덤보", c: [40.7015, -73.9895] },
  williamsburg: { label: "윌리엄스버그", c: [40.7185, -73.9565] },
};

// 가장 가까운 권역 (2.5km보다 멀면 그 장소만의 권역)
export function districtOf(loc) {
  let best = null;
  let bestKm = Infinity;
  for (const [k, d] of Object.entries(DISTRICTS)) {
    const km = distanceKm(loc, { lat: d.c[0], lon: d.c[1] });
    if (km < bestKm) [best, bestKm] = [k, km];
  }
  return bestKm <= 2.5 ? best : `far:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
}

// 두 권역을 하루에 같이 가도 되는지 (중심 사이 3km 이내 — 예: 다운타운+덤보, 소호+웨스트빌리지)
export function districtsNear(a, b) {
  if (a === b) return true;
  const da = DISTRICTS[a];
  const db = DISTRICTS[b];
  if (!da || !db) return false;
  return distanceKm({ lat: da.c[0], lon: da.c[1] }, { lat: db.c[0], lon: db.c[1] }) <= 3;
}

// ---------- 동네 묶음(클러스터) ----------
// 이스트 리버 기준으로 맨해튼/브루클린(·퀸스)을 나눈다: 위도별 강 경도를 이어 놓은 선
const RIVER = [
  [40.69, -74.02], [40.7, -74.005], [40.704, -73.996], [40.708, -73.99], [40.712, -73.978],
  [40.717, -73.972], [40.73, -73.966], [40.75, -73.958], [40.78, -73.94], [40.8, -73.93],
];
export function boroughOf(loc) {
  const lat = Math.min(Math.max(loc.lat, RIVER[0][0]), RIVER[RIVER.length - 1][0]);
  let i = 0;
  while (i < RIVER.length - 2 && lat > RIVER[i + 1][0]) i++;
  const [a, b] = [RIVER[i], RIVER[i + 1]];
  const riverLon = a[1] + ((lat - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  return loc.lon > riverLon ? "brooklyn" : "manhattan";
}

const CLUSTER_DIAMETER = 1.5; // km — 걸어서 둘러볼 만한 한 동네
const NEAR_CLUSTER = 2.5; // km — 하루에 같이 갈 수 있는 두 동네 (같은 쪽 강가일 때만)
const BRANCH_ATTACH = 1.0; // km — 체인 분점은 가까운 동네에 붙인다

// points: [{ key, lat, lon }] → 묶음. 같은 쪽 강가끼리만, 묶음 안 가장 먼 두 곳이 1.5km 이하가 되도록 (완전 연결)
export function clusterPoints(points) {
  let groups = points.map((p) => ({ members: [p], borough: boroughOf(p) }));
  const far = (g, h) => {
    if (g.borough !== h.borough) return Infinity;
    let m = 0;
    for (const a of g.members) for (const b of h.members) m = Math.max(m, distanceKm(a, b));
    return m;
  };
  for (;;) {
    let best = null;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const d = far(groups[i], groups[j]);
        if (d <= CLUSTER_DIAMETER && (!best || d < best.d)) best = { i, j, d };
      }
    if (!best) break;
    groups[best.i].members.push(...groups[best.j].members);
    groups.splice(best.j, 1);
  }
  return groups.map((g, i) => {
    const lat = g.members.reduce((a, m) => a + m.lat, 0) / g.members.length;
    const lon = g.members.reduce((a, m) => a + m.lon, 0) / g.members.length;
    // 이름: 장소들이 가장 많이 속한 권역 (같으면 중심에서 가까운 쪽)
    const votes = {};
    for (const m of g.members) {
      const l = clusterLabel(m, g.borough);
      votes[l] = (votes[l] || 0) + 1;
    }
    const center = clusterLabel({ lat, lon }, g.borough);
    const label = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || (b === center) - (a === center))[0];
    return { id: `c${i}`, lat, lon, borough: g.borough, keys: g.members.map((m) => m.key), label };
  });
}

// 묶음 이름: 같은 쪽 강가의 가장 가까운 권역 이름
export function clusterLabel(loc, borough = boroughOf(loc)) {
  let best = null;
  for (const d of Object.values(DISTRICTS)) {
    const c = { lat: d.c[0], lon: d.c[1] };
    if (boroughOf(c) !== borough) continue;
    const km = distanceKm(loc, c);
    if (!best || km < best.km) best = { km, label: d.label };
  }
  return best && best.km <= 2.5 ? best.label : borough === "brooklyn" ? "브루클린" : "맨해튼";
}

export function nearestCluster(clusters, loc) {
  const b = boroughOf(loc);
  let best = null;
  for (const c of clusters) {
    if (c.borough !== b) continue;
    const km = distanceKm(loc, c);
    if (!best || km < best.km) best = { km, c };
  }
  return best && best.km <= BRANCH_ATTACH ? best.c : null;
}

export const clustersNear = (a, b) => a === b || (a.borough === b.borough && distanceKm(a, b) <= NEAR_CLUSTER);
