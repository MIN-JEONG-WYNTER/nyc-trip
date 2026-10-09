// 구글 지도에서 조회한 데이터 (2026-10-09 기준, 그 주 영업시간 — 10/12 Columbus Day 포함)
// GOOGLE_HOURS: 장소 id(분점은 'id#분점번호') → OSM 형식 영업시간
// (n-skims: SKIMS 공식 홈페이지, n-housingworks: Time Out — 구글 지도에서 영업시간 표가 안 열린 곳)
export const GOOGLE_HOURS = {
 "seed-kith": "Mo 10:00-21:00; Tu 10:00-21:00; We 10:00-21:00; Th 10:00-21:00; Fr 10:00-21:00; Sa 10:00-21:00; Su 11:00-20:00",
 "seed-wgaca": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 12:00-18:00",
 "seed-wgaca#0": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 12:00-18:00",
 "seed-flyingsolo": "Mo 11:30-19:00; Tu 11:30-19:00; We 11:30-19:00; Th 11:30-19:00; Fr 11:30-19:00; Sa 11:30-19:00; Su 11:30-19:00",
 "seed-lindustrie": "Mo 12:00-22:00; Tu 12:00-22:00; We 12:00-22:00; Th 12:00-22:00; Fr 12:00-22:00; Sa 12:00-22:00; Su 12:00-22:00",
 "seed-liberty": "Mo 08:30-19:00; Tu 08:30-19:00; We 08:30-19:00; Th 08:30-19:00; Fr 08:30-19:00; Sa 08:30-19:00; Su 08:30-19:00",
 "seed-amnh": "Mo 10:00-17:30; Tu 10:00-17:30; We 10:00-17:30; Th 10:00-17:30; Fr 10:00-17:30; Sa 10:00-17:30; Su 10:00-17:30",
 "seed-keens": "Mo 11:45-22:30; Tu 11:45-22:30; We 11:45-22:30; Th 11:45-22:30; Fr 11:45-22:30; Sa 17:00-22:30; Su 17:00-21:30",
 "seed-nubeluz": "Mo 15:00-24:00; Tu 15:00-24:00; We 15:00-24:00; Th 13:00-01:00; Fr 13:00-01:00; Sa 11:00-01:00; Su 11:00-24:00",
 "seed-bark": "Mo 11:00-20:00; Tu 11:00-20:00; We 11:00-20:00; Th 11:00-20:00; Fr 11:00-21:00; Sa 11:00-21:00; Su 11:00-21:00",
 "seed-nubiani": "Mo 12:00-23:00; Tu 12:00-23:00; We 12:00-23:00; Th 12:00-24:00; Fr 12:00-01:00; Sa 12:00-01:00; Su 12:00-23:00",
 "seed-benjamin": "Mo 11:30-22:00; Tu 11:30-22:30; We 11:30-22:00; Th 11:30-22:00; Fr 11:30-22:00; Sa 16:00-22:00; Su 16:00-22:30",
 "seed-benjamin#0": "Mo 07:00-22:00; Tu 07:00-22:00; We 07:00-22:00; Th 07:00-22:00; Fr 07:00-22:00; Sa 07:00-22:00; Su 07:00-22:00",
 "g-leons": "Mo 07:00-15:00; Tu 07:00-15:00; We 07:00-15:00; Th 07:00-15:00; Fr 07:00-16:00; Sa 07:00-16:00; Su 07:00-16:00",
 "g-leons#0": "Mo 08:00-15:00; Tu 08:00-15:00; We 08:00-15:00; Th 08:00-15:00; Fr 08:00-16:00; Sa 08:00-16:00; Su 08:00-16:00",
 "g-magnolia": "Mo 08:00-22:00; Tu 08:00-22:00; We 08:00-22:00; Th 08:00-22:00; Fr 08:00-23:00; Sa 08:00-23:00; Su 08:00-22:00",
 "g-howoo": "Mo 17:00-23:00; Tu 17:00-23:00; We 17:00-23:00; Th 17:00-24:00; Fr 17:00-01:00; Sa 12:00-01:00; Su 12:00-23:00",
 "g-chelsea": "Mo 07:00-22:00; Tu 07:00-22:00; We 07:00-22:00; Th 07:00-22:00; Fr 07:00-22:00; Sa 07:00-22:00; Su 07:00-22:00",
 "g-frontgeneral": "Mo 11:30-19:30; Tu 11:30-19:30; We 11:30-19:30; Th 11:30-19:30; Fr 11:30-19:30; Sa 11:30-19:30; Su 10:30-18:30",
 "g-stanselm": "Mo 17:00-23:00; Tu 17:00-23:00; We 17:00-23:00; Th 17:00-23:00; Fr 17:00-23:00; Sa 12:00-23:00; Su 12:00-23:00",
 "g-regular": "Mo 07:00-15:00; Tu 07:00-15:00; We 07:00-15:00; Th 07:00-15:00; Fr 07:00-15:00; Sa 07:00-16:00; Su 07:00-16:00",
 "g-skylark": "Mo 17:00-24:00; Tu 17:00-24:00; We 17:00-24:00; Th 17:00-24:00; Fr 17:00-24:00; Sa off; Su off",
 "g-moma": "Mo 10:30-17:30; Tu 10:30-17:30; We 10:30-17:30; Th 10:30-17:30; Fr 10:30-20:30; Sa 10:30-17:30; Su 10:30-17:30",
 "g-levain": "Mo 07:00-24:00; Tu 07:00-24:00; We 07:00-24:00; Th 07:00-24:00; Fr 07:00-24:00; Sa 07:00-24:00; Su 07:00-24:00",
 "g-roome": "Mo 12:00-19:00; Tu 12:00-19:00; We 12:00-19:00; Th 12:00-19:00; Fr 12:00-19:00; Sa 12:00-19:00; Su 12:00-19:00",
 "g-katz": "Mo 08:00-23:00; Tu 08:00-23:00; We 08:00-23:00; Th 08:00-23:00; Fr 08:00-23:30; Sa 00:00-24:00; Su 00:00-23:00",
 "g-tiredthrift": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 11:00-18:00",
 "g-guizio": "Mo 11:00-20:00; Tu 11:00-20:00; We 11:00-20:00; Th 11:00-20:00; Fr 11:00-20:00; Sa 11:00-20:00; Su 11:00-19:00",
 "g-stussy": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 12:00-18:00",
 "g-nyon": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 10:00-19:00; Sa 10:00-19:00; Su 10:00-19:00",
 "g-fishseddy": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 10:00-18:00",
 "g-wayan": "Mo 12:00-15:30,17:30-23:00; Tu 12:00-15:30,17:30-23:00; We 12:00-15:30,17:30-23:00; Th 12:00-15:30,17:30-24:00; Fr 12:00-15:30,17:30-24:00; Sa 11:30-16:00,17:00-24:00; Su 11:30-16:00,17:00-23:00",
 "g-westlight": "Mo 16:00-23:00; Tu 16:00-24:00; We 16:00-24:00; Th 16:00-24:00; Fr 16:00-01:00; Sa 12:00-02:00; Su 12:00-24:00",
 "g-naminori": "Mo 11:30-21:30; Tu 11:30-21:30; We 11:30-21:30; Th 11:30-21:30; Fr 11:30-22:00; Sa 11:30-22:00; Su 11:30-21:30",
 "g-elchato": "Mo 12:00-22:00; Tu 12:00-22:00; We 12:00-22:00; Th 12:00-22:00; Fr 12:00-23:00; Sa 12:00-23:00; Su 12:00-22:00",
 "g-kimskimbap": "Mo 11:00-21:00; Tu 11:00-21:00; We 11:00-21:00; Th 11:00-21:00; Fr 11:00-21:00; Sa 11:00-21:00; Su 11:00-21:00",
 "g-aucheval": "Mo 17:00-22:30; Tu 17:00-22:30; We 12:00-22:30; Th 12:00-22:30; Fr 12:00-23:30; Sa 11:00-15:00,17:00-23:30; Su 11:00-15:00,17:00-22:30",
 "g-burgerjoint": "Mo 11:00-23:00; Tu 11:00-23:00; We 11:00-23:00; Th 11:00-23:00; Fr 11:00-23:00; Sa 11:00-23:00; Su 11:00-23:00",
 "g-nougatine": "Mo 07:00-22:00; Tu 07:00-22:00; We 07:00-22:00; Th 07:00-22:00; Fr 07:00-22:00; Sa 08:00-22:00; Su 08:00-22:00",
 "g-met": "Mo 10:00-17:00; Tu 10:00-17:00; We off; Th 10:00-17:00; Fr 10:00-21:00; Sa 10:00-21:00; Su 10:00-17:00",
 "g-summit": "Mo 08:00-24:00; Tu 08:00-24:00; We 08:00-24:00; Th 08:00-24:00; Fr 08:00-24:00; Sa 08:00-24:00; Su 08:00-24:00",
 "g-birdland": "Mo 16:30-24:00; Tu 16:30-23:30; We 16:30-23:30; Th 16:30-23:30; Fr 16:30-24:00; Sa 16:30-24:00; Su 16:30-24:00",
 "g-peterluger": "Mo 11:45-21:30; Tu 11:45-21:30; We 11:45-21:30; Th 11:45-21:30; Fr 11:45-21:30; Sa 11:45-21:30; Su 11:45-21:30",
 "seed-oculus": "Mo 00:00-24:00; Tu 00:00-24:00; We 00:00-24:00; Th 00:00-24:00; Fr 00:00-24:00; Sa 00:00-24:00; Su 00:00-24:00",
 "seed-911": "Mo 09:00-19:00; Tu off; We 09:00-19:00; Th 09:00-19:00; Fr 09:00-19:00; Sa 09:00-19:00; Su 09:00-19:00",
 "n-starbucks-reserve": "Mo 07:30-22:00; Tu 07:30-22:00; We 07:30-22:00; Th 07:30-22:00; Fr 07:30-23:00; Sa 07:30-23:00; Su 07:30-22:00",
 "n-century21": "Mo 09:00-21:00; Tu 09:00-21:00; We 09:00-21:00; Th 09:00-21:00; Fr 09:00-21:00; Sa 09:00-21:00; Su 11:00-20:00",
 "n-victorias-secret": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-lululemon": "Mo 10:00-21:00; Tu 10:00-21:00; We 10:00-21:00; Th 10:00-21:00; Fr 10:00-21:00; Sa 10:00-21:00; Su 10:00-20:00",
 "n-alo": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-20:00",
 "n-sephora": "Mo 09:00-21:00; Tu 09:00-21:00; We 09:00-21:00; Th 09:00-21:00; Fr 09:00-21:00; Sa 09:00-21:00; Su 10:00-20:00",
 "n-glossier": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-supreme": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 12:00-18:00",
 "n-dsm": "Mo 11:00-18:00; Tu 11:00-18:00; We 11:00-18:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 12:00-18:00",
 "n-bode": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 11:00-19:00",
 "n-reformation": "Mo 11:00-20:00; Tu 11:00-20:00; We 11:00-20:00; Th 11:00-20:00; Fr 11:00-20:00; Sa 11:00-20:00; Su 11:00-19:00",
 "n-brandy": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 12:00-20:00; Sa 12:00-20:00; Su 11:00-19:00",
 "n-procell": "Mo 12:00-19:00; Tu 12:00-19:00; We 12:00-19:00; Th 12:00-19:00; Fr 12:00-19:00; Sa 12:00-19:00; Su 12:00-18:00",
 "n-artistsfleas": "Mo 11:00-20:00; Tu 11:00-20:00; We 11:00-20:00; Th 11:00-20:00; Fr 11:00-20:00; Sa 11:00-20:00; Su 11:00-19:00",
 "n-beacons": "Mo 11:00-20:00; Tu 11:00-20:00; We 11:00-20:00; Th 11:00-20:00; Fr 11:00-20:00; Sa 11:00-20:00; Su 11:00-20:00",
 "n-stelladallas": "Mo 12:00-19:15; Tu 12:00-19:15; We 12:00-19:15; Th 12:00-19:15; Fr 12:00-19:15; Sa 12:00-19:15; Su 12:00-19:15",
 "n-tokio7": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 11:00-19:00",
 "n-victorias-secret#1": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-victorias-secret#2": "Mo 10:00-21:00; Tu 10:00-21:00; We 10:00-21:00; Th 10:00-21:00; Fr 10:00-22:00; Sa 10:00-22:00; Su 10:00-21:00",
 "n-victorias-secret#3": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-victorias-secret#4": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-victorias-secret#5": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su off",
 "n-lululemon#0": "Mo 10:00-19:00; Tu 10:00-19:00; We 10:00-19:00; Th 10:00-19:00; Fr 10:00-19:00; Sa 10:00-19:00; Su 10:00-19:00",
 "n-lululemon#1": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 10:00-19:00",
 "n-lululemon#2": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 10:00-18:00",
 "n-lululemon#3": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-lululemon#4": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 10:00-20:00",
 "n-alo#0": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-sephora#0": "Mo 09:00-19:00; Tu 09:00-19:00; We 09:00-19:00; Th 09:00-19:00; Fr 09:00-19:00; Sa 11:00-19:00; Su 11:00-19:00",
 "n-sephora#1": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-sephora#2": "Mo 11:00-20:00; Tu 11:00-20:00; We 11:00-20:00; Th 11:00-20:00; Fr 11:00-21:00; Sa 10:00-21:00; Su 11:00-19:00",
 "n-sephora#3": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-19:00",
 "n-sephora#4": "Mo 10:00-20:00; Tu 10:00-20:00; We 10:00-20:00; Th 10:00-20:00; Fr 10:00-20:00; Sa 10:00-20:00; Su 11:00-20:00",
 "n-sephora#5": "Mo 09:00-21:00; Tu 09:00-21:00; We 09:00-21:00; Th 09:00-21:00; Fr 09:00-21:00; Sa 09:00-21:00; Su 11:00-19:00",
 "n-glossier#0": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 11:00-18:00",
 "n-reformation#0": "Mo 11:00-20:00; Tu 11:00-20:00; We 11:00-20:00; Th 11:00-20:00; Fr 11:00-20:00; Sa 11:00-20:00; Su 11:00-19:00",
 "n-reformation#1": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 11:00-18:00",
 "n-ald": "Mo 11:00-19:00; Tu 11:00-19:00; We 11:00-19:00; Th 11:00-19:00; Fr 11:00-19:00; Sa 11:00-19:00; Su 12:00-18:00",
 "n-skims": "Mo-Sa 10:00-20:00; Su 11:00-19:00",
 "n-housingworks": "Mo-Sa 11:00-19:00; Su 11:00-17:00"
};

// 말로 요청한 곳(selected: true)과 편집샵·빈티지샵 후보(보류)
export const REQUESTED_PLACES = [
 {
  "id": "n-starbucks-reserve",
  "name": "Starbucks Reserve Roastery",
  "lat": 40.7416,
  "lon": -74.0053,
  "category": "cafe",
  "duration": 45,
  "tags": [],
  "selected": true,
  "addr": "61 9th Ave, NY 10011",
  "branches": []
 },
 {
  "id": "n-century21",
  "name": "Century 21",
  "lat": 40.71046,
  "lon": -74.01039,
  "category": "shop",
  "duration": 75,
  "tags": [],
  "selected": true,
  "addr": "22 Cortlandt St, Manhattan, NY 10007",
  "branches": []
 },
 {
  "id": "n-victorias-secret",
  "name": "Victoria's Secret PINK",
  "lat": 40.722,
  "lon": -73.99922,
  "category": "shop",
  "duration": 30,
  "tags": [],
  "selected": true,
  "addr": "500 Broadway Spc 500, NY 10012",
  "branches": [
   {
    "label": "593 Broadway, Manhattan",
    "lat": 40.72504,
    "lon": -73.99732,
    "osm": {
     "type": "node",
     "id": 4455539694
    },
    "hours": null
   },
   {
    "label": "Fort Greene Place, Brooklyn",
    "lat": 40.6847,
    "lon": -73.9765,
    "osm": {
     "type": "node",
     "id": 4768477257
    },
    "hours": null
   },
   {
    "label": "100 West 33rd Street, Manhattan",
    "lat": 40.74939,
    "lon": -73.98987,
    "osm": {
     "type": "node",
     "id": 2711422128
    },
    "hours": null
   },
   {
    "label": "640 5th Avenue, Manhattan",
    "lat": 40.75944,
    "lon": -73.9768,
    "osm": {
     "type": "node",
     "id": 1428427573
    },
    "hours": null
   },
   {
    "label": "165 East 86th Street, Manhattan",
    "lat": 40.77925,
    "lon": -73.95459,
    "osm": {
     "type": "node",
     "id": 7134809799
    },
    "hours": null
   },
   {
    "label": "54 The Promenade, Edgewater",
    "lat": 40.80645,
    "lon": -73.98884,
    "osm": {
     "type": "node",
     "id": 3486847406
    },
    "hours": null
   }
  ]
 },
 {
  "id": "n-skims",
  "name": "SKIMS",
  "lat": 40.75943,
  "lon": -73.97616,
  "category": "shop",
  "duration": 30,
  "tags": [],
  "selected": true,
  "addr": "647 5th Ave, NY 10022",
  "branches": []
 },
 {
  "id": "n-lululemon",
  "name": "lululemon",
  "lat": 40.72294,
  "lon": -73.9992,
  "category": "shop",
  "duration": 30,
  "tags": [],
  "selected": true,
  "addr": "524 Broadway, NY 10012",
  "branches": [
   {
    "label": "426 West 14th Street, Manhattan",
    "lat": 40.74134,
    "lon": -74.00674,
    "osm": {
     "type": "node",
     "id": 13740325211
    },
    "hours": null
   },
   {
    "label": "114 5th Avenue, Manhattan",
    "lat": 40.73787,
    "lon": -73.99252,
    "osm": {
     "type": "node",
     "id": 5781183307
    },
    "hours": null
   },
   {
    "label": "313 Washington Street, Downtown",
    "lat": 40.74047,
    "lon": -74.02977,
    "osm": {
     "type": "node",
     "id": 9081262466
    },
    "hours": null
   },
   {
    "label": "129 North 6th Street, Brooklyn",
    "lat": 40.71788,
    "lon": -73.95904,
    "osm": {
     "type": "node",
     "id": 5774371491
    },
    "hours": null
   },
   {
    "label": "592 5th Avenue, Manhattan",
    "lat": 40.75725,
    "lon": -73.97841,
    "osm": {
     "type": "node",
     "id": 663072725
    },
    "hours": null
   }
  ]
 },
 {
  "id": "n-alo",
  "name": "Alo",
  "lat": 40.72322,
  "lon": -73.99945,
  "category": "shop",
  "duration": 30,
  "tags": [],
  "selected": true,
  "addr": "96 Spring St, NY 10012",
  "branches": [
   {
    "label": "Bedford Avenue, Brooklyn",
    "lat": 40.71579,
    "lon": -73.95973,
    "osm": {
     "type": "node",
     "id": 11108337438
    },
    "hours": null
   }
  ]
 },
 {
  "id": "n-sephora",
  "name": "Sephora",
  "lat": 40.7241,
  "lon": -73.99839,
  "category": "shop",
  "duration": 40,
  "tags": [],
  "selected": true,
  "addr": "557 Broadway, NY 10012",
  "branches": [
   {
    "label": "175 Broadway, Manhattan",
    "lat": 40.71002,
    "lon": -74.01003,
    "osm": {
     "type": "node",
     "id": 13753275745
    },
    "hours": null
   },
   {
    "label": "210 Joralemon Street, Brooklyn",
    "lat": 40.6924,
    "lon": -73.99086,
    "osm": {
     "type": "node",
     "id": 4772142949
    },
    "hours": null
   },
   {
    "label": "Mall Drive West, Journal Square",
    "lat": 40.72652,
    "lon": -74.03839,
    "osm": {
     "type": "way",
     "id": 654086961
    },
    "hours": null
   },
   {
    "label": "3 Saint Marks Place, Manhattan",
    "lat": 40.72956,
    "lon": -73.98968,
    "osm": {
     "type": "node",
     "id": 13899747348
    },
    "hours": null
   },
   {
    "label": "Albee Square, Brooklyn",
    "lat": 40.69042,
    "lon": -73.98331,
    "osm": {
     "type": "node",
     "id": 12480632406
    },
    "hours": null
   },
   {
    "label": "40 East 14th Street, Manhattan",
    "lat": 40.7349,
    "lon": -73.99149,
    "osm": {
     "type": "node",
     "id": 11997971643
    },
    "hours": null
   }
  ]
 },
 {
  "id": "n-glossier",
  "name": "Glossier",
  "lat": 40.72243,
  "lon": -73.99789,
  "category": "shop",
  "duration": 30,
  "tags": [],
  "selected": true,
  "addr": "72 Spring St, NY 10012",
  "branches": [
   {
    "label": "77 North 6th Street, Brooklyn",
    "lat": 40.71896,
    "lon": -73.96081,
    "osm": {
     "type": "node",
     "id": 2839699879
    },
    "hours": null
   }
  ]
 },
 {
  "id": "n-supreme",
  "name": "Supreme",
  "lat": 40.72119,
  "lon": -73.99407,
  "category": "shop",
  "duration": 30,
  "tags": [
   "select"
  ],
  "selected": false,
  "addr": "190 Bowery, NY 10012",
  "branches": []
 },
 {
  "id": "n-ald",
  "name": "Aimé Leon Dore",
  "lat": 40.7223,
  "lon": -73.9959,
  "category": "shop",
  "duration": 40,
  "tags": [
   "select"
  ],
  "selected": false,
  "addr": "224 Mulberry St, NY 10012",
  "branches": []
 },
 {
  "id": "n-dsm",
  "name": "Dover Street Market",
  "lat": 40.74414,
  "lon": -73.98177,
  "category": "shop",
  "duration": 60,
  "tags": [
   "select"
  ],
  "selected": false,
  "addr": "160 Lexington Ave, NY 10016",
  "branches": []
 },
 {
  "id": "n-bode",
  "name": "Bode",
  "lat": 40.71571,
  "lon": -73.99101,
  "category": "shop",
  "duration": 30,
  "tags": [
   "select"
  ],
  "selected": false,
  "addr": "58 Hester St, NY 10002",
  "branches": []
 },
 {
  "id": "n-reformation",
  "name": "Reformation",
  "lat": 40.72291,
  "lon": -74.00077,
  "category": "shop",
  "duration": 30,
  "tags": [],
  "selected": false,
  "addr": "62 Greene St, NY 10012",
  "branches": [
   {
    "label": "23 Howard Street, Manhattan",
    "lat": 40.71938,
    "lon": -74.00049,
    "osm": {
     "type": "node",
     "id": 5923163685
    },
    "hours": null
   },
   {
    "label": "Ludlow Street, Manhattan",
    "lat": 40.72097,
    "lon": -73.98775,
    "osm": {
     "type": "node",
     "id": 11196535069
    },
    "hours": null
   }
  ]
 },
 {
  "id": "n-brandy",
  "name": "Brandy Melville",
  "lat": 40.7228,
  "lon": -73.99927,
  "category": "shop",
  "duration": 30,
  "tags": [],
  "selected": false,
  "addr": "519 Broadway, NY 10012",
  "branches": []
 },
 {
  "id": "n-procell",
  "name": "Procell",
  "lat": 40.71997,
  "lon": -73.99366,
  "category": "shop",
  "duration": 40,
  "tags": [
   "vintage"
  ],
  "selected": false,
  "addr": "5 Delancey St, NY 10002",
  "branches": []
 },
 {
  "id": "n-artistsfleas",
  "name": "Artists & Fleas SoHo",
  "lat": 40.72193,
  "lon": -73.99957,
  "category": "shop",
  "duration": 45,
  "tags": [
   "vintage"
  ],
  "selected": false,
  "addr": "490 Broadway, NY 10012",
  "branches": []
 },
 {
  "id": "n-beacons",
  "name": "Beacon's Closet",
  "lat": 40.72363,
  "lon": -73.95258,
  "category": "shop",
  "duration": 45,
  "tags": [
   "vintage"
  ],
  "selected": false,
  "addr": "74 Guernsey St, Brooklyn, NY 11222",
  "branches": []
 },
 {
  "id": "n-stelladallas",
  "name": "10 Ft Single by Stella Dallas",
  "lat": 40.71445,
  "lon": -73.95353,
  "category": "shop",
  "duration": 45,
  "tags": [
   "vintage"
  ],
  "selected": false,
  "addr": "285 N 6th St, Brooklyn, NY 11211",
  "branches": []
 },
 {
  "id": "n-tokio7",
  "name": "Tokio 7",
  "lat": 40.72726,
  "lon": -73.98614,
  "category": "shop",
  "duration": 30,
  "tags": [
   "vintage"
  ],
  "selected": false,
  "addr": "83 E 7th St, NY 10003",
  "branches": []
 },
 {
  "id": "n-housingworks",
  "name": "Housing Works Thrift Shop",
  "lat": 40.72478,
  "lon": -73.99643,
  "category": "shop",
  "duration": 40,
  "tags": [
   "vintage"
  ],
  "selected": false,
  "addr": "130 Crosby St, NY 10012",
  "branches": []
 }
];
