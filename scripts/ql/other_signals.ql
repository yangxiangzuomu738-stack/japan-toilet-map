[out:json][timeout:900];
area["ISO3166-1"="JP"]["admin_level"="2"]->.jp;
(
  nwr(area.jp)["toilets"]["toilets"!="yes"]["toilets"!="no"][!"amenity"];
  nwr(area.jp)["toilets"]["toilets"!="yes"]["toilets"!="no"]["amenity"!="toilets"];
);
out count;
