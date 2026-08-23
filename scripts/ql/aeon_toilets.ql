[out:json][timeout:900];
area["ISO3166-1"="JP"]["admin_level"="2"]->.jp;
(
  way(area.jp)["name"~"イオン"]["shop"];
  relation(area.jp)["name"~"イオン"]["shop"];
  way(area.jp)["name"~"イオン"]["building"="retail"];
  relation(area.jp)["name"~"イオン"]["building"="retail"];
)->.a;
.a map_to_area -> .aa;
(
  node(area.aa)["amenity"="toilets"];
  way(area.aa)["amenity"="toilets"];
);
out count;
