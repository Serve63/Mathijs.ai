const PROVINCE_IDS = new Set([
  "Groningen",
  "Friesland",
  "Drenthe",
  "Overijssel",
  "Flevoland",
  "Gelderland",
  "Utrecht",
  "North Holland",
  "South Holland",
  "Zealand",
  "North Brabant",
  "Limburg",
  "BE_WestFlanders",
  "BE_EastFlanders",
  "BE_Antwerp",
  "BE_Limburg",
  "BE_FlemishBrabant",
  "BE_Brussels",
  "BE_WalloonBrabant",
  "BE_Hainaut",
  "BE_Namur",
  "BE_Liege",
  "BE_Luxembourg",
]);

const COUNTRY_LABELS = {
  NL: "Nederland",
  BE: "Belgie",
};

const REGION_CODE_MAP = {
  "NL-NH": "North Holland",
  NH: "North Holland",
  "NL-ZH": "South Holland",
  ZH: "South Holland",
  "NL-NB": "North Brabant",
  NB: "North Brabant",
  "NL-ZE": "Zealand",
  ZE: "Zealand",
  "NL-FR": "Friesland",
  FR: "Friesland",
  "NL-GR": "Groningen",
  GR: "Groningen",
  "NL-DR": "Drenthe",
  DR: "Drenthe",
  "NL-OV": "Overijssel",
  OV: "Overijssel",
  "NL-FL": "Flevoland",
  FL: "Flevoland",
  "NL-GE": "Gelderland",
  GE: "Gelderland",
  "NL-UT": "Utrecht",
  UT: "Utrecht",
  "NL-LI": "Limburg",
  LI: "Limburg",
  "BE-VAN": "BE_Antwerp",
  VAN: "BE_Antwerp",
  "BE-VOV": "BE_EastFlanders",
  VOV: "BE_EastFlanders",
  "BE-VWV": "BE_WestFlanders",
  VWV: "BE_WestFlanders",
  "BE-VBR": "BE_FlemishBrabant",
  VBR: "BE_FlemishBrabant",
  "BE-VLI": "BE_Limburg",
  VLI: "BE_Limburg",
  "BE-BRU": "BE_Brussels",
  BRU: "BE_Brussels",
  "BE-WBR": "BE_WalloonBrabant",
  WBR: "BE_WalloonBrabant",
  "BE-WHT": "BE_Hainaut",
  WHT: "BE_Hainaut",
  "BE-WLG": "BE_Liege",
  WLG: "BE_Liege",
  "BE-WLX": "BE_Luxembourg",
  WLX: "BE_Luxembourg",
  "BE-WNA": "BE_Namur",
  WNA: "BE_Namur",
};

const REGION_NAME_MAP = {
  "north holland": "North Holland",
  "noord holland": "North Holland",
  "noord-holland": "North Holland",
  "south holland": "South Holland",
  "zuid holland": "South Holland",
  "zuid-holland": "South Holland",
  "north brabant": "North Brabant",
  "noord brabant": "North Brabant",
  "noord-brabant": "North Brabant",
  zealand: "Zealand",
  zeeland: "Zealand",
  friesland: "Friesland",
  groningen: "Groningen",
  drenthe: "Drenthe",
  overijssel: "Overijssel",
  flevoland: "Flevoland",
  gelderland: "Gelderland",
  utrecht: "Utrecht",
  limburg: "Limburg",
  "west flanders": "BE_WestFlanders",
  "west vlaanderen": "BE_WestFlanders",
  "west-vlaanderen": "BE_WestFlanders",
  "east flanders": "BE_EastFlanders",
  "oost vlaanderen": "BE_EastFlanders",
  "oost-vlaanderen": "BE_EastFlanders",
  antwerp: "BE_Antwerp",
  antwerpen: "BE_Antwerp",
  "flemish brabant": "BE_FlemishBrabant",
  "vlaams brabant": "BE_FlemishBrabant",
  "vlaams-brabant": "BE_FlemishBrabant",
  brussels: "BE_Brussels",
  brussel: "BE_Brussels",
  "brussels-capital region": "BE_Brussels",
  "walloon brabant": "BE_WalloonBrabant",
  "waals brabant": "BE_WalloonBrabant",
  "waals-brabant": "BE_WalloonBrabant",
  hainaut: "BE_Hainaut",
  henegouwen: "BE_Hainaut",
  namur: "BE_Namur",
  namen: "BE_Namur",
  liege: "BE_Liege",
  luik: "BE_Liege",
  luxembourg: "BE_Luxembourg",
  luxemburg: "BE_Luxembourg",
};

function readHeader(req, name) {
  const value = req.headers[name] || req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]).trim() : "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickProvinceId(country, regionCode, regionName) {
  const code = String(regionCode || "").trim().toUpperCase();
  if (code) {
    const direct = REGION_CODE_MAP[code];
    if (direct && PROVINCE_IDS.has(direct)) return direct;
    if (country) {
      const prefixed = REGION_CODE_MAP[`${country}-${code}`];
      if (prefixed && PROVINCE_IDS.has(prefixed)) return prefixed;
    }
  }
  const nameKey = normalizeName(regionName);
  if (nameKey) {
    const mapped = REGION_NAME_MAP[nameKey];
    if (mapped && PROVINCE_IDS.has(mapped)) {
      if (country === "BE" && mapped === "Limburg") return "BE_Limburg";
      return mapped;
    }
  }
  return null;
}

function buildGeoLabel({ country, regionName, city, provinceId }) {
  if (provinceId) return "";
  const countryLabel = COUNTRY_LABELS[country] || country || "";
  const regionLabel = regionName || "";
  const cityLabel = city || "";
  if (regionLabel && countryLabel) return `${regionLabel}, ${countryLabel}`;
  if (regionLabel) return regionLabel;
  if (cityLabel && countryLabel) return `${cityLabel}, ${countryLabel}`;
  if (cityLabel) return cityLabel;
  if (countryLabel) return countryLabel;
  return "";
}

function getGeoFromRequest(req) {
  const country = readHeader(req, "x-vercel-ip-country");
  const region = readHeader(req, "x-vercel-ip-country-region");
  const regionName = readHeader(req, "x-vercel-ip-country-region-name");
  const city = readHeader(req, "x-vercel-ip-city");
  const provinceId = pickProvinceId(country, region, regionName);
  const regionLabel = regionName || (city ? "" : region);
  const label = buildGeoLabel({
    country,
    regionName: regionLabel || "",
    city,
    provinceId,
  });
  return {
    country,
    region,
    regionName,
    city,
    provinceId,
    label,
  };
}

module.exports = {
  getGeoFromRequest,
  COUNTRY_LABELS,
};
