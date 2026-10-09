// 카테고리별 기본값.
// hours: 영업시간 정보가 없을 때 쓰는 기본 영업시간(분), window: 시작 가능 시간대, meal: 식사 종류
const h = (a, b) => [a * 60, b * 60];

export const MEAL_WINDOWS = {
  breakfast: h(7, 10.5),
  lunch: h(11.5, 15),
  dinner: h(17, 21.5),
};

// 식당이 배정되지 않은 끼니에도 비워두는 "자유 식사" 시간 (시작 가능 시간대·소요시간)
export const MEAL_SLOTS = {
  lunch: { label: "점심", window: h(11.5, 14), dur: 60 },
  dinner: { label: "저녁", window: h(17.5, 20.5), dur: 75 },
};

export const CATEGORIES = {
  restaurant: { label: "식당", icon: "🍴", dur: 75, meal: "any", hours: [h(11, 22.5)] },
  breakfast: { label: "아침", icon: "🥯", dur: 45, meal: "breakfast", hours: [h(7, 11)] },
  lunch: { label: "점심", icon: "🍜", dur: 60, meal: "lunch", hours: [h(11, 22.5)] },
  dinner: { label: "저녁", icon: "🍽️", dur: 90, meal: "dinner", hours: [h(11, 22.5)] },
  cafe: { label: "카페·디저트", icon: "☕", dur: 40, hours: [h(7, 21)] },
  bar: { label: "바·루프탑", icon: "🍸", dur: 90, hours: [h(16, 26)], window: h(18, 24) },
  sight: { label: "관광·산책", icon: "🌉", dur: 60, hours: [h(0, 24)], window: h(7, 22) },
  museum: { label: "박물관", icon: "🏛️", dur: 150, hours: [h(10, 17.5)] },
  shop: { label: "쇼핑", icon: "🛍️", dur: 45, hours: [h(10, 21)] },
  tour: { label: "투어·보트", icon: "⛴️", dur: 180, hours: [h(8.5, 17)] },
  show: { label: "공연", icon: "🎭", dur: 150, hours: [h(14, 23.5)] },
  ticket: { label: "티켓·줄서기", icon: "🎟️", dur: 60, hours: [h(9, 20)] },
  other: { label: "기타", icon: "📍", dur: 60, hours: [h(0, 24)], window: h(7, 23) },
};

export const cat = (key) => CATEGORIES[key] || CATEGORIES.other;

// Photon(OSM) 검색 결과의 osm_key / osm_value → 카테고리
export function categoryFromOsm(key, value) {
  if (key === "amenity") {
    if (["restaurant", "fast_food", "food_court"].includes(value)) return "restaurant";
    if (["cafe", "ice_cream"].includes(value)) return "cafe";
    if (["bar", "pub", "nightclub", "biergarten"].includes(value)) return "bar";
    if (["theatre", "cinema", "arts_centre", "concert_hall"].includes(value)) return "show";
  }
  if (key === "tourism") {
    if (["museum", "gallery"].includes(value)) return "museum";
    if (["attraction", "viewpoint", "artwork", "zoo", "aquarium", "theme_park"].includes(value)) return "sight";
  }
  if (key === "shop") return ["bakery", "pastry", "confectionery", "chocolate"].includes(value) ? "cafe" : "shop";
  if (key === "leisure" || key === "historic" || key === "natural" || key === "bridge" || key === "man_made") return "sight";
  return "other";
}
