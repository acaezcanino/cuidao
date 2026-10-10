// Pill-bottle barcode → medication info, using the FDA's public NDC Directory
// (openFDA, https://open.fda.gov/apis/drug/ndc/). No key needed for light use.
//
// What a barcode on a medicine bottle contains:
//   - Manufacturer / store bottles (and most over-the-counter bottles): a UPC-A
//     "3 + 10-digit NDC + check digit", or a GS1 DataMatrix/GS1-128 with GTIN-14
//     "(01) 0 03 + NDC10 + check". The NDC identifies product, strength AND
//     package size, so the FDA record tells us how many pills come in the bottle.
//   - Pharmacy labels usually encode the pharmacy's prescription number, which
//     is NOT in any public database. Those codes are reported as "not found".

const API = "https://api.fda.gov/drug/ndc.json";

const digitsOf = (s) => String(s).replace(/\D/g, "");

// The three legal ways to split a 10-digit NDC: 4-4-2, 5-3-2, 5-4-1.
function splits10(n) {
  return [
    `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}`,
    `${n.slice(0, 5)}-${n.slice(5, 8)}-${n.slice(8)}`,
    `${n.slice(0, 5)}-${n.slice(5, 9)}-${n.slice(9)}`,
  ];
}

// 11-digit (5-4-2, zero-padded) NDC → the 10-digit form it came from.
function from11(n) {
  const [a, b, c] = [n.slice(0, 5), n.slice(5, 9), n.slice(9)];
  const out = [];
  if (a[0] === "0") out.push(`${a.slice(1)}-${b}-${c}`);
  if (b[0] === "0") out.push(`${a}-${b.slice(1)}-${c}`);
  if (c[0] === "0") out.push(`${a}-${b}-${c.slice(1)}`);
  return out;
}

// Barcode text (or a typed number) → hyphenated NDC package codes to try, best first.
export function ndcCandidates(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  // Already a hyphenated NDC, e.g. typed "0093-7364-56"
  if (/^\d{4,5}-\d{3,4}-\d{1,2}$/.test(text)) return [text];

  const d = digitsOf(text);
  let ndc10 = null;

  // GS1 element string: (01) + GTIN-14, possibly followed by lot/expiry fields.
  const gs1 = text.match(/\(01\)\s*(\d{14})/) || (d.length > 14 && d.startsWith("01") ? [null, d.slice(2, 16)] : null);
  const gtin = gs1 ? gs1[1] : d.length === 14 ? d : null;
  if (gtin && gtin.slice(1, 3) === "03") ndc10 = gtin.slice(3, 13);
  else if (d.length === 12 && d[0] === "3") ndc10 = d.slice(1, 11); // UPC-A
  else if (d.length === 13 && d.startsWith("03")) ndc10 = d.slice(2, 12); // EAN-13 of a UPC-A
  else if (d.length === 10) ndc10 = d; // typed 10-digit NDC
  else if (d.length === 11) return [`${d.slice(0, 5)}-${d.slice(5, 9)}-${d.slice(9)}`, ...from11(d)];

  return ndc10 ? splits10(ndc10) : [];
}

const SOLID = /(TABLET|CAPSULE|CAPLET|PILL|SOFTGEL|GELCAP|LOZENGE|WAFER|TROCHE)/;

// "100 TABLET, FILM COATED in 1 BOTTLE (…)" → { count: 100, unit: "TABLET" }.
// Nested packages ("1 BOTTLE in 1 CARTON / 100 CAPSULE in 1 BOTTLE") use the pill part.
export function parsePackage(description = "") {
  const parts = description.split(" / ");
  const part = parts.find((p) => SOLID.test(p.split(" in ")[0])) || parts[parts.length - 1];
  const m = part.match(/^\s*(\d+(?:\.\d+)?)\s+([A-Z][A-Z ,\-]*?)\s+in\s+1\b/);
  if (!m) return { count: null, unit: null };
  const unit = m[2].split(",")[0].trim();
  return { count: SOLID.test(unit) ? Math.round(Number(m[1])) : null, unit };
}

const SMALL = new Set(["and", "with", "in", "of", "y", "con", "de"]);
const titleCase = (s = "") =>
  s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/(^|[\-/(])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())))
    .join(" ");

// "50 mg/1" → "50 mg"; several ingredients are joined with " / ".
export function strengthOf(ingredients = []) {
  return ingredients
    .map((i) => String(i.strength || "").replace(/\/1$/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" / ");
}

// One openFDA product + the package code that was scanned → what the form needs.
export function toMedInfo(product, packageNdc) {
  const pkg = (product.packaging || []).find((p) => p.package_ndc === packageNdc) || {};
  const { count, unit } = parsePackage(pkg.description);
  const generic = product.generic_name || "";
  const brand = product.brand_name || "";
  return {
    name: titleCase(generic || brand),
    brand: brand && brand.toUpperCase() !== generic.toUpperCase() ? titleCase(brand) : "",
    strength: strengthOf(product.active_ingredients),
    count, // pills in a full bottle (null if not tablets/capsules)
    unit, // e.g. "TABLET"
    form: titleCase(product.dosage_form || ""),
    ndc: packageNdc,
    packageText: pkg.description || "",
    labeler: product.labeler_name || "",
  };
}

// Barcode → med info. Returns null when the code isn't a medicine NDC in the FDA list.
// Throws Error("network") if the FDA service can't be reached.
export async function lookupBarcode(raw, fetchImpl = fetch) {
  for (const code of ndcCandidates(raw)) {
    const url = `${API}?search=packaging.package_ndc:${encodeURIComponent(`"${code}"`)}&limit=1`;
    let res;
    try {
      res = await fetchImpl(url);
    } catch {
      throw new Error("network");
    }
    if (res.status === 404) continue; // openFDA answers 404 when nothing matches
    if (!res.ok) throw new Error("network");
    const data = await res.json();
    const product = data.results && data.results[0];
    if (product) return toMedInfo(product, code);
  }
  return null;
}

// PROTOTYPE ONLY: when the scanner sees a bottle (YOLO "bottle"/"cup"), or reads a
// barcode that isn't in the FDA list (e.g. a pharmacy Rx label), or there's no
// internet, the app registers this fixed medication so the demo always works.
// It is NOT identified from the bottle. Remove register()/DEMO_MED before real use.
export const DEMO_MED = {
  demo: true,
  name: "Levothyroxine",
  names: { en: "Levothyroxine", es: "Levotiroxina" },
  strength: "50 mcg",
  count: 30,
  form: "Tablet",
  dose: { en: "1 tablet", es: "1 tableta" },
};
