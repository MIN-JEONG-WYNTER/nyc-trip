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

export function seedTrip() {
  return {
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
      place("seed-lindustrie", "L’Industrie Pizzeria · West Village", 40.73338, -74.0067, "restaurant", 60),
      place("seed-westvillage", "West Village 산책", 40.7358, -74.0036, "sight", 60),
      place("seed-liberty", "Statue of Liberty (Statue City Cruises)", 40.70335, -74.017, "tour", 210, {
        note: "Battery Park에서 출발·복귀 (Liberty Island 포함)",
        priority: "must",
      }),
      place("seed-amnh", "American Museum of Natural History", 40.78132, -73.9737, "museum", 180),
      place("seed-keens", "Keens Steakhouse", 40.75077, -73.98641, "dinner", 90, { osm: { type: "node", id: 3068326556 } }),
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
      place("seed-bark", "Bark Barbecue · Time Out Market", 40.70305, -73.98985, "restaurant", 60),
      place("seed-oculus", "Oculus", 40.71155, -74.01345, "sight", 30),
      place("seed-911", "9/11 Memorial", 40.7115, -74.0134, "sight", 45),
    ],
    schedule: null,
  };
}
