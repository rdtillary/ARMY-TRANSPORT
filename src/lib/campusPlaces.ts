/** Named buildings / grounds of the MCTE campus, shown as labels on the maps. */
export type CampusPlace = { name: string; lat: number; lng: number };

export const CAMPUS_PLACES: CampusPlace[] = [
  { name: "CTW", lat: 22.536473, lng: 75.750945 },
  { name: "AIRFIELD GROUND", lat: 22.535035, lng: 75.756202 },
  { name: "OFFICER'S MESS", lat: 22.535164, lng: 75.759438 },
  { name: "FLASH MESS", lat: 22.534519, lng: 75.752063 },
  { name: "MILAN", lat: 22.53812, lng: 75.757526 },
  { name: "BHASKAR BLOCK", lat: 22.53523, lng: 75.760567 },
  { name: "TAKASHSHILA LIBRARY", lat: 22.534282, lng: 75.760528 },
  { name: "KALAM BLOCK", lat: 22.534691, lng: 75.761298 },
  { name: "SPARROWS NEST", lat: 22.536068, lng: 75.761702 },
  { name: "MCTE GROUND", lat: 22.536574, lng: 75.76255 },
  { name: "SARABHAI LABS", lat: 22.535077, lng: 75.762385 },
  { name: "RAMAN BLOCK", lat: 22.536474, lng: 75.761964 },
  { name: "CIPHER WING", lat: 22.536727, lng: 75.76105 },
  { name: "FCE", lat: 22.533926, lng: 75.762555 },
  { name: "URC", lat: 22.538481, lng: 75.763752 },
  { name: "HQ MCTE", lat: 22.530193, lng: 75.761165 },
];

/** Centre of all labelled places — used as the Live Control map's starting view. */
export const CAMPUS_VIEW_CENTER: [number, number] = [22.5345, 75.7568]; // [lat, lng]

const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Self-styled (inline) label so it needs no stylesheet change. `withText=false` gives a dot only. */
export function placeLabelHtml(name: string, withText = true): string {
  const dot =
    '<span style="width:8px;height:8px;border-radius:2px;background:rgba(212,196,138,.55);border:1px solid rgba(26,21,8,.5);flex-shrink:0;display:inline-block"></span>';
  const text = withText
    ? `<span style="background:rgba(14,20,9,.38);color:rgba(243,233,192,.85);border:1px solid rgba(139,111,46,.35);padding:1px 6px 2px;border-radius:5px;font-size:10px;font-weight:700;letter-spacing:.04em;line-height:1.25;white-space:nowrap;text-shadow:0 0 3px rgba(0,0,0,.7)">${esc(name)}</span>`
    : "";
  return `<div data-place="${esc(name)}" style="display:flex;align-items:center;gap:5px;pointer-events:none;white-space:nowrap">${dot}${text}</div>`;
}

/** Below this zoom the labels collapse to dots so the map does not clutter. */
export const PLACE_LABEL_MIN_ZOOM = 14;
