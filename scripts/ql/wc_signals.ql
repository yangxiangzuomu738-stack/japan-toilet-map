[out:json][timeout:900];
area["ISO3166-1"="JP"]["admin_level"="2"]->.jp;
(
  nwr(area.jp)["toilets:wheelchair"]["amenity"!="toilets"][!"toilets"];
  nwr(area.jp)["toilets:disposal"]["amenity"!="toilets"][!"toilets"];
  nwr(area.jp)["toilets:position"]["amenity"!="toilets"][!"toilets"];
  nwr(area.jp)["toilets:access"]["amenity"!="toilets"][!"toilets"];
  nwr(area.jp)["ostomate"]["amenity"!="toilets"][!"toilets"];
);
out count;
