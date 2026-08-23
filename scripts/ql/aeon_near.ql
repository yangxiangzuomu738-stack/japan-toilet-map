[out:json][timeout:900];
area["ISO3166-1"="JP"]["admin_level"="2"]->.jp;
(
  nwr(area.jp)["name"~"イオン"]["shop"];
  nwr(area.jp)["name"~"イオン"]["building"="retail"];
)->.a;
node(around.a:150)["amenity"="toilets"];
out count;
