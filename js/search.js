// 장소 검색(Photon)과 영업시간 조회(OpenStreetMap API). 둘 다 키 없이 쓰는 무료 서비스.
import { categoryFromOsm, cuisineFromOsm } from "./categories.js";
import { distanceKm } from "./geo.js";

const PHOTON = "https://photon.komoot.io";
const OSM_API = "https://api.openstreetmap.org/api/0.6";
const NYC_BBOX = "-74.27,40.49,-73.68,40.93";
const OSM_TYPES = { N: "node", W: "way", R: "relation" };

function toResult(f) {
  const pr = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const addr = [pr.housenumber && pr.street ? `${pr.housenumber} ${pr.street}` : pr.street, pr.district || pr.locality || pr.city]
    .filter(Boolean)
    .join(", ");
  return {
    name: pr.name || pr.street || "이름 없는 장소",
    lat,
    lon,
    addr,
    category: categoryFromOsm(pr.osm_key, pr.osm_value),
    kind: pr.osm_value,
    osm: OSM_TYPES[pr.osm_type] ? { type: OSM_TYPES[pr.osm_type], id: pr.osm_id } : null,
  };
}

export async function searchPlaces(query, { signal } = {}) {
  const url = `${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=12&lat=40.735&lon=-73.99&bbox=${NYC_BBOX}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`검색 실패 (${res.status})`);
  const data = await res.json();
  return data.features.filter((f) => f.properties.name).map(toResult);
}

export async function reverseGeocode(lat, lon) {
  const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&limit=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.features[0] ? toResult(data.features[0]) : null;
}

export async function fetchOsmTags(osm) {
  if (!osm) return null;
  const res = await fetch(`${OSM_API}/${osm.type}/${osm.id}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.elements?.[0]?.tags || null;
}

// OSM id를 모르는 장소(직접 추가·초기 데이터)는 이름+위치로 OSM 객체를 찾는다
export async function findOsmMatch(place) {
  const url = `${PHOTON}/api/?q=${encodeURIComponent(place.name.split("·")[0].split("(")[0].trim())}&limit=5&lat=${place.lat}&lon=${place.lon}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const near = data.features.map(toResult).filter((r) => r.osm && distanceKm(r, place) < 0.35);
  return near[0] || null;
}

export async function lookupHours(place) {
  const osm = place.osm || (await findOsmMatch(place))?.osm;
  if (!osm) return { osm: null, hours: null, cuisine: null };
  const tags = await fetchOsmTags(osm);
  return {
    osm,
    hours: tags?.opening_hours || null,
    cuisine: cuisineFromOsm(tags?.cuisine),
    website: tags?.website || tags?.["contact:website"] || null,
  };
}

// ---------- 분점 ----------
// 상호 비교용 키: 소문자, 기호 제거, 흔한 업종 단어 제거 ("L’industrie Pizza" = "L'Industrie Pizzeria")
const GENERIC = new Set(["the", "pizza", "pizzeria", "restaurant", "steakhouse", "steak", "house", "bar", "grill", "cafe", "coffee", "nyc", "no", "co", "kitchen"]);
export function brandKey(name) {
  return String(name || "")
    .split(/[·(]/)[0]
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’'`.]/g, "")
    .replace(/([a-z])(\d)/g, "$1 $2") // "No.1" = "No. 1"
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !GENERIC.has(w))
    .join("");
}

const MAX_BRANCHES = 12;

// 같은 상호의 다른 지점들을 찾는다 (본점과 100m 이상 떨어진 곳, 호텔에서 가까운 순으로 최대 12곳)
export async function findBranches(place, center) {
  const key = brandKey(place.name);
  if (!key) return [];
  const q = place.name.split(/[·(]/)[0].trim();
  const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=50&bbox=${NYC_BBOX}`);
  if (!res.ok) throw new Error(`분점 검색 실패 (${res.status})`);
  const data = await res.json();
  const picked = [];
  for (const r of data.features.map(toResult)) {
    if (brandKey(r.name) !== key || !r.osm) continue;
    if (place.osm && r.osm.type === place.osm.type && r.osm.id === place.osm.id) continue;
    if (distanceKm(r, place) < 0.1 || picked.some((b) => distanceKm(b, r) < 0.1)) continue;
    picked.push({ label: r.addr || r.name, lat: r.lat, lon: r.lon, osm: r.osm, hours: null });
  }
  return picked.sort((a, b) => distanceKm(a, center) - distanceKm(b, center)).slice(0, MAX_BRANCHES);
}

// 분점마다 OSM 영업시간을 채운다 (무료 API라 천천히)
export async function fillBranchHours(branches) {
  const out = [];
  for (const b of branches) {
    const tags = await fetchOsmTags(b.osm).catch(() => null);
    out.push({ ...b, hours: tags?.opening_hours || null });
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}
