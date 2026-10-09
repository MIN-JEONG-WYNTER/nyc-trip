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

// 식당 메뉴 구분. osm: OSM cuisine 태그 값 중 이 메뉴로 볼 것들
export const CUISINES = {
  korean: { label: "한식", icon: "🍲", osm: ["korean"] },
  pizza: { label: "피자", icon: "🍕", osm: ["pizza"] },
  burger: { label: "햄버거", icon: "🍔", osm: ["burger", "hamburger", "hot_dog"] },
  steak: { label: "스테이크", icon: "🥩", osm: ["steak_house", "steak"] },
  barbecue: { label: "바비큐", icon: "🍖", osm: ["barbecue", "bbq"] },
  chicken: { label: "치킨", icon: "🍗", osm: ["chicken", "fried_chicken", "wings"] },
  japanese: { label: "일식·스시", icon: "🍣", osm: ["japanese", "sushi"] },
  ramen: { label: "라멘·누들", icon: "🍜", osm: ["ramen", "noodle", "udon", "soba"] },
  chinese: { label: "중식", icon: "🥟", osm: ["chinese", "dumpling", "dim_sum", "cantonese", "sichuan"] },
  asian: { label: "아시안", icon: "🍛", osm: ["thai", "vietnamese", "indian", "asian", "malaysian", "filipino"] },
  italian: { label: "이탈리안·파스타", icon: "🍝", osm: ["italian", "pasta"] },
  mexican: { label: "멕시칸·타코", icon: "🌮", osm: ["mexican", "tacos", "taco", "tex-mex", "latin_american"] },
  seafood: { label: "해산물", icon: "🦞", osm: ["seafood", "fish", "oyster", "lobster"] },
  sandwich: { label: "샌드위치·델리", icon: "🥪", osm: ["sandwich", "deli", "bagel"] },
  brunch: { label: "브런치", icon: "🍳", osm: ["breakfast", "brunch", "diner", "pancake"] },
  mediterranean: { label: "지중해·중동", icon: "🥙", osm: ["mediterranean", "greek", "middle_eastern", "falafel", "lebanese", "turkish", "kebab"] },
  american: { label: "아메리칸", icon: "🇺🇸", osm: ["american", "southern", "regional"] },
  french: { label: "프렌치", icon: "🥖", osm: ["french"] },
  other: { label: "기타 음식", icon: "🍴", osm: [] },
};

// 구체적인 음식 값. 나라·끼니 구분(italian, japanese, brunch…)보다 먼저 고르고, american은 가장 나중에 고른다
const DISH = new Set([
  "pizza", "burger", "hamburger", "hot_dog", "steak_house", "steak", "barbecue", "bbq", "chicken", "fried_chicken", "wings",
  "sushi", "ramen", "noodle", "udon", "soba", "dumpling", "dim_sum", "tacos", "taco", "sandwich", "deli", "bagel",
  "pasta", "pancake", "falafel", "kebab", "seafood", "fish", "oyster", "lobster",
]);
const cuisineKeyOf = (v) => Object.keys(CUISINES).find((k) => CUISINES[k].osm.includes(v));
// 한식은 예외로 가장 먼저 (korean;bbq는 한식당 — 한국 여행자가 "한식"으로 찾는 곳)
const cuisineRank = (v) => (v === "korean" ? -1 : DISH.has(v) ? 0 : CUISINES.american.osm.includes(v) ? 2 : 1);

// OSM cuisine 태그("american;barbecue", "italian;pizza", "new_york_pizza" 처럼 여러 개·변형일 수 있음) → 메뉴 키.
// 모든 값을 보고 가장 구체적인 것을 고른다 (같은 순위면 앞의 값)
export function cuisineFromOsm(tag) {
  if (!tag) return null;
  let best = null;
  for (const v of tag.toLowerCase().split(";").map((x) => x.trim()).filter(Boolean)) {
    // 값 전체가 안 맞으면 "_"로 나눈 조각("italian_pizza" → pizza)도 본다
    for (const c of [v, ...v.split(/[_\s]+/)]) {
      const k = cuisineKeyOf(c);
      if (k && (!best || cuisineRank(c) < best.rank)) best = { k, rank: cuisineRank(c) };
    }
  }
  return best ? best.k : "other";
}

// 화면 표시용 종류(식당이면 메뉴로)
export function kindOf(p) {
  if (p.category === "restaurant" && p.cuisine && CUISINES[p.cuisine]) return CUISINES[p.cuisine];
  return cat(p.category);
}

const NOT_SHOP = new Set(["real_estate", "estate_agent", "insurance", "travel_agency", "funeral_directors", "vacant", "storage_rental", "money_lender", "pawnbroker", "car_repair", "trade", "wholesale"]);

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
  if (key === "shop") {
    if (["bakery", "pastry", "confectionery", "chocolate"].includes(value)) return "cafe";
    // 부동산·보험·여행사처럼 둘러볼 매장이 아닌 곳
    if (NOT_SHOP.has(value)) return "other";
    return "shop";
  }
  if (key === "leisure" || key === "historic" || key === "natural" || key === "bridge" || key === "man_made") return "sight";
  return "other";
}
