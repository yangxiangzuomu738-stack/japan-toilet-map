[out:json][timeout:600];
area["ISO3166-1"="JP"]["admin_level"="2"]->.jp;
(
  nwr(area.jp)["name"~"イオン"]["shop"];
  nwr(area.jp)["name"~"イオン"]["building"="retail"];
  nwr(area.jp)["name"~"イオン"]["amenity"="marketplace"];
);
out count;
