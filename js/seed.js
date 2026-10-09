import { GOOGLE_HOURS, REQUESTED_PLACES } from "./google-data.js";

// 처음 열었을 때(공유 데이터가 아직 없을 때) 쓰는 초기 데이터 — 기존 고정 일정의 장소들
const T0 = 1760000000000;

const place = (id, name, lat, lon, category, duration, extra = {}) => ({
  id,
  name,
  lat,
  lon,
  category,
  duration,
  hours: null,
  hoursSource: null,
  slots: [],
  pin: { day: null, time: null },
  before: null,
  priority: "want",
  selected: true,
  note: "",
  osm: null,
  addedBy: null,
  updatedAt: T0,
  ...extra,
});

// 처음 배포 이후에 추가한 장소들 — 이미 쓰고 있는 데이터에도 migrateTrip이 한 번 넣어준다
const T1 = 1791500000000;
const node = (id) => ({ type: "node", id });
const way = (id) => ({ type: "way", id });
const osmHours = (hours, osm) => ({ hours, hoursSource: "osm", osm });
// 구글 지도 "뉴욕 데이트" 목록에서 가져온 곳은 보류 상태로 넣는다 (갈 곳은 직접 고르기)
const fromList = (id, name, lat, lon, category, duration, extra = {}) =>
  place(id, name, lat, lon, category, duration, { selected: false, source: "google-list", updatedAt: T1 + 10, ...extra });

const ADDED_SEED_PLACES = [
  place("seed-nubiani", "Nubiani", 40.74697, -73.98535, "restaurant", 75, {
    cuisine: "korean",
    ...osmHours("Mo-We 12:00-23:00; Th 12:00-00:00; Fr-Sa 12:00-01:00; Su 12:00-23:00", node(12662597204)),
    addr: "315 5th Ave 3층, Koreatown",
    website: "https://www.nubianinyc.com/",
    updatedAt: T1,
  }),
  // 구글 목록에 있는 Benjamin Prime을 본점으로, 같은 계열 Benjamin Steakhouse(OSM에 없음, 주소 기준 위치)를 분점으로
  place("seed-benjamin", "Benjamin Prime", 40.75145, -73.97965, "restaurant", 90, {
    cuisine: "steak",
    osm: node(2714855288),
    addr: "23 E 40th St, Midtown",
    branches: [{ label: "Benjamin Steakhouse · 52 E 41st St (Dylan Hotel)", lat: 40.75136, lon: -73.97904, osm: null, hours: null }],
    branchesCheckedAt: T1,
    website: "https://benjaminsteakhouse.com/",
    updatedAt: T1 + 1,
  }),

  fromList("g-leons", "Leon's Bagels", 40.70985, -74.00907, "restaurant", 40, {
    cuisine: "sandwich",
    mealPref: "breakfast",
    addr: "12 John St, FiDi",
    branches: [{ label: "181 Mulberry St, Nolita", lat: 40.72087, lon: -73.9968, osm: null, hours: null }],
    branchesCheckedAt: T1,
  }),
  fromList("g-magnolia", "Magnolia Bakery", 40.75929, -73.98061, "cafe", 30, {
    ...osmHours("Mo-Su 08:30-22:00", node(10236585208)),
    addr: "1240 6th Ave, Rockefeller Center",
    branches: [{ label: "Upper West Side", lat: 40.77569, lon: -73.98028, osm: node(2745005783), hours: "Su-Th 07:30-22:00; Fr-Sa 07:30-24:00" }],
    branchesCheckedAt: T1,
  }),
  fromList("g-howoo", "HOWOO", 40.74632, -73.985, "restaurant", 90, {
    cuisine: "korean",
    ...osmHours("Mo-We 17:00-23:00, Th 17:00-24:00, Fr 17:00-01:00, Sa 12:00-01:00, Su 12:00-23:00", node(14158398134)),
    addr: "7 E 31st St, Koreatown",
  }),
  fromList("g-chelsea", "Chelsea Market", 40.74244, -74.00614, "sight", 75, {
    ...osmHours("Mo-Su 07:00-22:00", node(1272608999)),
    addr: "75 9th Ave, Chelsea",
  }),
  fromList("g-frontgeneral", "Front General Store", 40.70255, -73.98728, "shop", 40, { osm: node(6499926986), addr: "143 Front St, DUMBO" }),
  fromList("g-stanselm", "St. Anselm", 40.71429, -73.95605, "restaurant", 90, {
    cuisine: "steak",
    ...osmHours("Mo-Th, Su 17:00-23:00; Fr-Sa 17:00-24:00", way(279777184)),
    addr: "355 Metropolitan Ave, Williamsburg",
  }),
  fromList("g-regular", "REGULAR NYC", 40.70804, -74.01416, "restaurant", 60, {
    cuisine: "other",
    ...osmHours("07:00-15:00", node(12386824050)),
    addr: "19 Rector St, FiDi",
  }),
  fromList("g-skylark", "The Skylark", 40.75419, -73.98886, "bar", 90, {
    ...osmHours("We 16:30-01:00; Th, Fr 16:30-01:30; Mo, Tu 16:30-00:00", node(5752764087)),
    addr: "200 W 39th St, Midtown · 루프탑 바",
  }),
  fromList("g-moma", "MoMA (The Museum of Modern Art)", 40.76143, -73.97762, "museum", 150, {
    ...osmHours("Mo-Su 10:30-17:30; Sa 10:30-19:00", way(278346578)),
    addr: "11 W 53rd St, Midtown",
  }),
  fromList("g-levain", "Levain Bakery", 40.72619, -73.99465, "cafe", 20, {
    ...osmHours("Mo-Su 07:00-23:00", node(7243595520)),
    addr: "340 Lafayette St, NoHo",
  }),
  fromList("g-roome", "ROOME", 40.71725, -73.99033, "other", 45, { addr: "324 Grand St, Lower East Side", note: "종류를 몰라 ‘기타’로 넣었어요. 편집에서 바꿔주세요" }),
  fromList("g-katz", "Katz's Delicatessen", 40.72227, -73.98737, "restaurant", 60, {
    cuisine: "sandwich",
    ...osmHours("Mo-Th 08:00-22:15; Fr 08:00-24:00; Sa 00:00-24:00; Su 00:00-22:15", node(1915398676)),
    addr: "205 E Houston St, Lower East Side",
  }),
  fromList("g-tiredthrift", "Tired Thrift", 40.72388, -73.95141, "shop", 40, { addr: "10 Bedford Ave, Greenpoint" }),
  fromList("g-guizio", "Guizio", 40.7237, -74.00075, "shop", 30, { addr: "81 Greene St, SoHo" }),
  fromList("g-stussy", "Stüssy", 40.7233, -73.99598, "shop", 30, { addr: "50 Prince St, SoHo" }),
  fromList("g-nyon", "New York or Nowhere (NYON)", 40.72317, -73.99718, "shop", 30, {
    ...osmHours("Mo-Th 11:00-19:00, Fr-Su 10:00-19:00", node(5152316164)),
    addr: "250 Lafayette St, SoHo",
  }),
  fromList("g-fishseddy", "Fishs Eddy", 40.73867, -73.99006, "shop", 40, {
    ...osmHours("Mo-Sa 10:00-21:00; Su 10:00-20:00", node(2555136017)),
    addr: "889 Broadway, Flatiron",
  }),
  fromList("g-wayan", "Wayan", 40.72137, -73.99509, "restaurant", 90, { cuisine: "asian", osm: node(7075387185), addr: "20 Spring St, Nolita · 인도네시아" }),
  fromList("g-westlight", "Westlight", 40.7223, -73.95654, "bar", 90, { osm: node(4406520514), addr: "111 N 12th St, Williamsburg · 루프탑 바" }),
  fromList("g-naminori", "Nami Nori", 40.73022, -74.00322, "restaurant", 60, { cuisine: "japanese", osm: node(14208263601), addr: "33 Carmine St, West Village · 테마키" }),
  fromList("g-elchato", "Taquería el Chato", 40.72984, -74.00043, "restaurant", 45, { cuisine: "mexican", addr: "120 MacDougal St, Greenwich Village" }),
  fromList("g-kimskimbap", "KIM'S KIMBAP", 40.73628, -73.99734, "restaurant", 40, { cuisine: "korean", addr: "496 6th Ave, Greenwich Village" }),
  fromList("g-aucheval", "Au Cheval", 40.71812, -74.00179, "restaurant", 75, {
    cuisine: "burger",
    ...osmHours("Mo-We 12:00-23:00; Th-Fr 12:00-24:00; Sa 11:00-24:00; Su 11:00-22:00", node(6919152917)),
    addr: "33 Cortlandt Alley, Tribeca",
  }),
  fromList("g-burgerjoint", "Burger Joint", 40.76417, -73.97857, "restaurant", 45, {
    cuisine: "burger",
    ...osmHours("Mo-Su 11:00-23:00", node(6071549934)),
    addr: "119 W 56th St, Midtown",
  }),
  fromList("g-nougatine", "Nougatine by Jean-Georges", 40.76903, -73.98163, "restaurant", 90, { cuisine: "french", addr: "1 Central Park W, Columbus Circle" }),
  fromList("g-met", "The Metropolitan Museum of Art", 40.77944, -73.96324, "museum", 180, {
    hours: "10:00-17:00; Fr-Sa 10:00-21:00; We off",
    hoursSource: "osm",
    osm: { type: "relation", id: 3698894 },
    addr: "1000 5th Ave, Upper East Side",
  }),
  fromList("g-summit", "SUMMIT One Vanderbilt", 40.75277, -73.97873, "sight", 90, { osm: node(10202468617), addr: "45 E 42nd St, Midtown · 전망대 (시간 지정 티켓)" }),
  fromList("g-birdland", "Birdland Jazz Club", 40.75909, -73.98972, "show", 120, {
    ...osmHours("Mo-Su 17:00-01:00", node(3573482095)),
    addr: "315 W 44th St, Midtown",
    note: "공연 시각을 정했으면 ‘정해진 시작 시각’에 넣어주세요",
  }),
  fromList("g-peterluger", "Peter Luger Steak House", 40.70988, -73.96251, "restaurant", 90, {
    cuisine: "steak",
    ...osmHours("Mo-Th 11:45-21:45; Fr-Sa 11:45-22:45; Su 12:45-21:45", node(2483716076)),
    addr: "178 Broadway, Williamsburg",
  }),
  ...REQUESTED_PLACES.map(({ id, name, lat, lon, category, duration, ...extra }) =>
    place(id, name, lat, lon, category, duration, { ...extra, branchesCheckedAt: T1, source: "request", updatedAt: T1 + 20 }),
  ),
];

// 편집샵·빈티지 태그 (문장 요청의 ‘편집샵’, ‘빈티지’에 쓰임)
const TAGS = {
  "seed-kith": ["select"], "seed-flyingsolo": ["select"], "g-nyon": ["select"], "g-stussy": ["select"],
  "seed-wgaca": ["vintage"], "g-tiredthrift": ["vintage"], "g-frontgeneral": ["vintage"],
};
// 구글 목록에서 왔지만 말로도 요청한 곳 → 선택
const NAMED = ["g-chelsea", "g-stussy"];

// 구글 목록 기준으로 기존 장소의 위치·영업시간을 바로잡는다 (사용자가 바꾸지 않은 값만)
const SEED_FIXES = {
  "seed-lindustrie": { from: [40.73338, -74.0067], lat: 40.73323, lon: -74.00491, addr: "104 Christopher St, West Village", ...osmHours("Mo-Su 12:00-22:00", node(12986801302)) },
  "seed-bark": { from: [40.70305, -73.98985], lat: 40.70367, lon: -73.99148, addr: "55 Water St 5층 (Time Out Market), DUMBO" },
  "seed-keens": { from: [40.75077, -73.98641], lat: 40.75075, lon: -73.98649, addr: "72 W 36th St, Midtown" },
  "seed-nubeluz": { from: [40.74495, -73.99105], lat: 40.74554, lon: -73.98885, addr: "25 W 28th St 꼭대기 층, NoMad" },
  "seed-amnh": { from: [40.78132, -73.9737], lat: 40.78132, lon: -73.97399, addr: "200 Central Park W", ...osmHours("Mo-Su 10:00-17:30", way(388436810)) },
  "seed-kith": { from: [40.72455, -73.9953], lat: 40.72603, lon: -73.99432, addr: "337 Lafayette St, NoHo", ...osmHours("Mo-Sa 11:00-21:00; Su 11:00-20:00", node(5302774621)) },
  "seed-wgaca": {
    from: [40.72085, -74.00155],
    lat: 40.72272,
    lon: -74.00297,
    addr: "351 W Broadway, SoHo",
    ...osmHours("Mo-Sa 09:00-18:00, Su 12:00-19:00", node(6052834497)),
    branches: [{ label: "113 Wooster St, SoHo", lat: 40.72488, lon: -74.00066, osm: null, hours: null }],
    branchesCheckedAt: T1,
  },
  "seed-chicago": { from: [40.76255, -73.98615], lat: 40.76129, lon: -73.98508, addr: "Ambassador Theatre · 219 W 49th St" },
  "seed-chicago-rush": { from: [40.76255, -73.98615], lat: 40.76129, lon: -73.98508, addr: "Ambassador Theatre · 219 W 49th St" },
};
const near = (a, b) => Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;

// 상호 비교용 (분점 찾기와 같은 규칙)
const brand = (name) =>
  String(name || "")
    .split(/[·(\-–]/)[0]
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f’'`.]/g, "")
    .replace(/\b(the|pizzeria|pizza|restaurant|steakhouse|steak|house|koreatown|nyc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
const sameSpot = (a, b) =>
  (a.osm && b.osm && a.osm.type === b.osm.type && a.osm.id === b.osm.id) ||
  (brand(a.name) && brand(a.name) === brand(b.name) && Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002);

// 예전 형식의 데이터를 지금 형식으로 맞춘다 (모든 폰에서 같은 결과가 나오도록 결정적으로)
export function migrateTrip(trip) {
  if (!trip) return trip;
  for (const p of trip.places) {
    // 예전의 "아침/점심/저녁" 종류 → 식당 + 끼니 옵션
    if (["breakfast", "lunch", "dinner"].includes(p.category)) {
      p.mealPref = p.category;
      p.category = "restaurant";
    }
  }
  for (const p of trip.places) {
    const fix = SEED_FIXES[p.id];
    if (!fix || p.fixedFromList) continue;
    p.fixedFromList = true;
    const { from, branches, branchesCheckedAt, hours, hoursSource, osm, ...rest } = fix;
    if (near(p, { lat: from[0], lon: from[1] })) Object.assign(p, { lat: rest.lat, lon: rest.lon });
    if (!p.addr) p.addr = rest.addr;
    if (hours && !p.hours) Object.assign(p, { hours, hoursSource, osm });
    if (branches && !p.branches?.length) Object.assign(p, { branches: structuredClone(branches), branchesCheckedAt });
  }
  if (near(trip.meta.hotel, { lat: 40.70805, lon: -74.01332 })) Object.assign(trip.meta.hotel, { lat: 40.70983, lon: -74.01402 });

  for (const sp of ADDED_SEED_PLACES) {
    const mine = trip.places.find((p) => p.id === sp.id);
    // 같은 곳을 이미 직접 추가했으면 그쪽을 살리고, 비어 있는 정보만 채운다
    const dup = trip.places.find((p) => p.id !== sp.id && !p.id.startsWith("seed-") && !p.id.startsWith("g-") && sameSpot(p, sp));
    if (dup) {
      for (const k of ["cuisine", "addr", "branches", "branchesCheckedAt", "website"]) if (sp[k] != null && dup[k] == null) dup[k] = structuredClone(sp[k]);
      if (!dup.hours && sp.hours) Object.assign(dup, { hours: sp.hours, hoursSource: sp.hoursSource, osm: dup.osm || sp.osm });
      if (dup.category === "restaurant" && (dup.cuisine === "other" || !dup.cuisine) && sp.cuisine) dup.cuisine = sp.cuisine;
      if (mine && !mine.deleted) Object.assign(mine, { deleted: true, selected: false, updatedAt: Math.max(mine.updatedAt || 0, dup.updatedAt || 0) + 1 });
      continue;
    }
    if (!mine) trip.places.push(structuredClone(sp));
  }
  for (const p of trip.places) {
    if (TAGS[p.id] && !p.tags) p.tags = TAGS[p.id];
    if (NAMED.includes(p.id) && !p.namedSelected) Object.assign(p, { selected: true, namedSelected: true });
    // 구글 영업시간: 직접 입력한 값은 그대로 두고 한 번만 넣는다
    if (GOOGLE_HOURS[p.id] && p.hoursSource !== "manual" && !p.googleHours) Object.assign(p, { hours: GOOGLE_HOURS[p.id], hoursSource: "google", googleHours: 1 });
    (p.branches || []).forEach((b, i) => {
      if (GOOGLE_HOURS[`${p.id}#${i}`] && !b.googleHours) Object.assign(b, { hours: GOOGLE_HOURS[`${p.id}#${i}`], googleHours: 1 });
    });
  }
  const seedCuisine = { "seed-keens": "steak", "seed-lindustrie": "pizza", "seed-bark": "barbecue" };
  for (const p of trip.places) if (seedCuisine[p.id] && !p.cuisine) p.cuisine = seedCuisine[p.id];
  return trip;
}

export function seedTrip() {
  return migrateTrip({
    schema: 1,
    meta: {
      title: "OUR NYC TRIP",
      startDate: "2026-10-09",
      hotel: { name: "Club Quarters World Trade Center", lat: 40.70805, lon: -74.01332 },
      days: [
        { start: "15:00", end: "23:00" }, // 체크인 15:00
        { start: "08:00", end: "23:00" },
        { start: "08:00", end: "23:00" },
        { start: "07:30", end: "11:00" }, // 체크아웃 11:00
      ],
      updatedAt: T0,
    },
    places: [
      place("seed-kith", "Kith Manhattan", 40.72455, -73.9953, "shop", 45),
      place("seed-wgaca", "What Goes Around Comes Around", 40.72085, -74.00155, "shop", 40),
      place("seed-flyingsolo", "Flying Solo", 40.72055, -74.00415, "shop", 40),
      place("seed-lindustrie", "L’Industrie Pizzeria · West Village", 40.73338, -74.0067, "restaurant", 60, { cuisine: "pizza" }),
      place("seed-westvillage", "West Village 산책", 40.7358, -74.0036, "sight", 60),
      place("seed-liberty", "Statue of Liberty (Statue City Cruises)", 40.70335, -74.017, "tour", 210, {
        note: "Battery Park에서 출발·복귀 (Liberty Island 포함)",
        priority: "must",
      }),
      place("seed-amnh", "American Museum of Natural History", 40.78132, -73.9737, "museum", 180),
      place("seed-keens", "Keens Steakhouse", 40.75077, -73.98641, "restaurant", 90, {
        cuisine: "steak",
        mealPref: "dinner",
        osm: { type: "node", id: 3068326556 },
      }),
      place("seed-nubeluz", "Nubeluz", 40.74495, -73.99105, "bar", 90),
      place("seed-chicago-rush", "Chicago 러시 티켓 줄서기", 40.76255, -73.98615, "ticket", 150, {
        hours: "09:30-12:30",
        hoursSource: "manual",
        before: "seed-chicago",
        note: "Ambassador Theatre 박스오피스",
      }),
      place("seed-chicago", "Chicago (Ambassador Theatre)", 40.76255, -73.98615, "show", 150, {
        slots: [{ day: 2, time: "19:00" }],
        priority: "must",
        note: "공연 날짜·시각은 실제 공연 일정에 맞게 수정하세요",
      }),
      place("seed-dumbo", "DUMBO (Washington St 뷰)", 40.7033, -73.9883, "sight", 60),
      place("seed-bark", "Bark Barbecue · Time Out Market", 40.70305, -73.98985, "restaurant", 60, { cuisine: "barbecue" }),
      ...ADDED_SEED_PLACES.map((p) => structuredClone(p)),
      place("seed-oculus", "Oculus", 40.71155, -74.01345, "sight", 30),
      place("seed-911", "9/11 Memorial", 40.7115, -74.0134, "sight", 45),
    ],
    schedule: null,
  });
}
