[out:json][timeout:900];
area["ISO3166-1"="JP"]["admin_level"="2"]->.jp;
(
  node(area.jp)["amenity"="toilets"];
  way(area.jp)["amenity"="toilets"];
  relation(area.jp)["amenity"="toilets"];
);
out center tags;
