/* SVG文字列だけを提供するデザイン用アイコン集。地図・データ処理は含みません。 */
(function () {
  "use strict";

  var frame = function (content, viewBox) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (viewBox || '0 0 24 24') + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + content + '</svg>';
  };

  var icons = {
    toilet: frame('<path d="M7 3h10v5H7z"/><path d="M5 8h14v4a7 7 0 0 1-14 0z"/><path d="M8 19v2M16 19v2"/>'),
    accessible: frame('<circle cx="12" cy="4.5" r="1.5" fill="currentColor" stroke="none"/><path d="M10 8h3l2 3h3M11 9l-1 5h4l2 5M10 14l-3 4M14 14l-1 5"/>'),
    seated: frame('<path d="M7 4h8v7H7z"/><path d="M5 11h13v3a5 5 0 0 1-10 0H5z"/><path d="M9 18v2M15 18v2"/>'),
    squat: frame('<path d="M6 6h12l-2 5H8z"/><path d="M8 11v7M16 11v7M6 18h12"/><ellipse cx="12" cy="8.5" rx="2.5" ry="1.5"/>'),
    both: frame('<path d="M4 5h7v7H4zM13 5h7l-1 5h-5z"/><path d="M3 12h9M4 12v5M10 12v5M14 10v7M19 10v7M13 17h8"/>'),
    male: frame('<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7M8.5 10l3.5-3 3.5 3M9 21l3-7 3 7"/>'),
    female: frame('<circle cx="12" cy="4.5" r="2"/><path d="M12 7l-4 8h8zM12 15v6M9.5 21h5"/>'),
    unisex: frame('<circle cx="8" cy="5" r="1.5"/><circle cx="16" cy="5" r="1.5"/><path d="M8 7v7M5.5 10l2.5-3 2.5 3M6 21l2-7 2 7M16 7l-3 8h6zM16 15v6M13.5 21h5"/>'),
    baby: frame('<path d="M4 8h16v10H4z"/><path d="M7 12h10M8 18v2M16 18v2"/><circle cx="12" cy="5" r="1.5"/><path d="M10 6.5 8 9M14 6.5 16 9"/>'),
    ostomate: frame('<path d="M8 3h8v18H8z"/><circle cx="12" cy="8" r="2"/><path d="M12 10v6M10 14h4"/><circle cx="15.5" cy="15.5" r="2.5" fill="currentColor" stroke="none"/>'),
    paid: frame('<circle cx="12" cy="12" r="8"/><path d="M14.5 8.5c-.6-.5-1.4-.8-2.4-.8-1.4 0-2.4.7-2.4 1.8 0 2.8 5.1 1.2 5.1 4 0 1.1-1 1.9-2.6 1.9-1 0-2-.3-2.8-1M12 6.5v11"/>'),
    free: frame('<path d="M4 8h16v11H4z"/><path d="M8 8V5h8v3M8 13h8M7 17h2M12 17h5"/>'),
    clock: frame('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.5 2"/>'),
    public: frame('<path d="M4 20h16M6 20V9l6-5 6 5v11M9 20v-6h6v6M9 10h.01M15 10h.01"/>'),
    place: frame('<path d="M4 20h16M6 20V9l6-5 6 5v11M9 20v-6h6v6M9 10h.01M15 10h.01"/><path d="M18 4.5c0 2.7-4 5-4 5s-4-2.3-4-5a4 4 0 1 1 8 0Z" fill="currentColor" stroke="none"/><circle cx="14" cy="4.5" r="1" fill="white" stroke="none"/>'),
    operator: frame('<circle cx="12" cy="8" r="3"/><path d="M5 20c.8-3.5 3.2-5 7-5s6.2 1.5 7 5"/>'),
    search: frame('<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>'),
    location: frame('<path d="M20 10.5c0 5.4-8 10-8 10s-8-4.6-8-10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10.5" r="2.5"/>'),
    currentLocation: frame('<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>'),
    plus: frame('<path d="M12 5v14M5 12h14"/>'),
    minus: frame('<path d="M5 12h14"/>'),
    compass: frame('<path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" fill="currentColor"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2"/>'),
    close: frame('<path d="m6 6 12 12M18 6 6 18"/>'),
    directions: frame('<path d="M4 5h10l6 6-6 6H4l4-6z"/><path d="M8 11h6M14 8v6"/>'),
    filter: frame('<path d="M4 6h16M7 12h10M10 18h4"/>'),
    list: frame('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r=".8" fill="currentColor" stroke="none"/><circle cx="5" cy="18" r=".8" fill="currentColor" stroke="none"/>'),
    info: frame('<circle cx="12" cy="12" r="8"/><path d="M12 10v6"/><circle cx="12" cy="7" r=".8" fill="currentColor" stroke="none"/>'),
    empty: frame('<path d="M7 3h10v5H7z"/><path d="M5 8h14v4a7 7 0 0 1-14 0z"/><path d="M8 19v2M16 19v2M5 5l14 14"/>'),
    unknown: frame('<path d="M9.5 9a2.8 2.8 0 1 1 4.6 2.2c-1.2 1-2.1 1.6-2.1 3.3"/><circle cx="12" cy="17.5" r=".8" fill="currentColor" stroke="none"/>'),
    externalLink: frame('<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 13v5H5V6h5"/>')
  };

  icons.marker = function (kind, selected) {
    var state = kind === "yes" || kind === "no" ? kind : "unknown";
    var outer = state === "yes"
      ? '<path d="M16 1.5c-7.2 0-13 5.8-13 13 0 9.3 13 23.5 13 23.5S29 23.8 29 14.5c0-7.2-5.8-13-13-13Z" fill="currentColor" stroke="white" stroke-width="2"/>'
      : state === "no"
        ? '<path d="M4 4.5h24v20.2L16 38 4 24.7Z" fill="currentColor" stroke="white" stroke-width="2" stroke-linejoin="round"/>'
        : '<path d="M16 1.5 30 15.5 16 38 2 15.5Z" fill="currentColor" stroke="white" stroke-width="2" stroke-linejoin="round"/>';
    var symbol = state === "yes"
      ? '<circle cx="16" cy="10" r="2" fill="white" stroke="none"/><path d="M13 14h4l2 3h3M14 15l-1 5h4l2 5M13 20l-3 4M17 20l-1 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      : state === "no"
        ? '<path d="M10 10 22 22M22 10 10 22" stroke="white" stroke-width="3" stroke-linecap="round"/>'
        : '<path d="M12.5 12a3.6 3.6 0 1 1 5.9 2.8c-1.5 1.2-2.5 2.1-2.5 4.2" stroke="white" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="23" r="1.2" fill="white" stroke="none"/>';
    var ring = selected ? '<path d="M16 1.5c-7.2 0-13 5.8-13 13 0 9.3 13 23.5 13 23.5S29 23.8 29 14.5c0-7.2-5.8-13-13-13Z" fill="none" stroke="currentColor" stroke-width="5" opacity=".35"/>' : '';
    return '<svg class="tm-marker tm-marker--' + state + (selected ? ' tm-marker--selected' : '') + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" aria-hidden="true" focusable="false">' + ring + outer + symbol + '</svg>';
  };

  /* 施設にトイレがあることだけが記録され、正確な位置が分からない場合の印。
     先端を持たない破線の面で「施設のどこか」を示し、kind は外形と記号の両方で区別する。 */
  icons.facilityMarker = function (kind, selected) {
    var state = kind === "yes" || kind === "no" ? kind : "unknown";
    var outer = state === "yes"
      ? '<circle cx="16" cy="20" r="14" fill="currentColor" stroke="white" stroke-width="2.5" stroke-dasharray="4 3"/>'
      : state === "no"
        ? '<rect x="3" y="7" width="26" height="26" rx="4" fill="currentColor" stroke="white" stroke-width="2.5" stroke-dasharray="4 3"/>'
        : '<path d="M16 4 29 20 16 36 3 20Z" fill="currentColor" stroke="white" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="4 3"/>';
    var symbol = state === "yes"
      ? '<circle cx="16" cy="14" r="2" fill="white" stroke="none"/><path d="M13 18h4l2 3h3M14 19l-1 5h4l2 5M13 24l-3 4M17 24l-1 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      : state === "no"
        ? '<path d="M10 14 22 26M22 14 10 26" stroke="white" stroke-width="3" stroke-linecap="round"/>'
        : '<path d="M12.5 16a3.6 3.6 0 1 1 5.9 2.8c-1.5 1.2-2.5 2.1-2.5 4.2" stroke="white" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="27" r="1.2" fill="white" stroke="none"/>';
    var ring = selected
      ? state === "yes"
        ? '<circle cx="16" cy="20" r="15.5" fill="none" stroke="currentColor" stroke-width="3" opacity=".35"/>'
        : state === "no"
          ? '<rect x="1.5" y="5.5" width="29" height="29" rx="5" fill="none" stroke="currentColor" stroke-width="3" opacity=".35"/>'
          : '<path d="M16 2 30.5 20 16 38 1.5 20Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" opacity=".35"/>'
      : '';
    return '<svg class="tm-marker tm-marker--facility tm-marker--' + state + (selected ? ' tm-marker--selected' : '') + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" aria-hidden="true" focusable="false">' + ring + outer + symbol + '</svg>';
  };

  window.TMIcons = icons;
}());
