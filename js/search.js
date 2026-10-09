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
