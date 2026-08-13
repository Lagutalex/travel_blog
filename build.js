/* ---------------------------------------------------------------
   Сборка данных для сайта.
   Читает:  data/site.json  +  data/trips/*.json  (их правит админка)
   Пишет:   data/trips.json                       (его читает сайт)

   Запускается сам на Netlify при каждом сохранении в админке.
   Локально при желании: node build.js
   Никаких библиотек не нужно, только Node.
   --------------------------------------------------------------- */

const fs = require("fs");
const path = require("path");

const TRIPS_DIR = path.join(__dirname, "data", "trips");
const SITE_FILE = path.join(__dirname, "data", "site.json");
const OUT_FILE = path.join(__dirname, "data", "trips.json");

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error("Не читается " + file + ": " + err.message);
  }
}

/* Админка складывает поля по группам (details, covers, text),
   а сайт ждёт их одним плоским списком. Здесь и раскладываем. */
function flatten(entry, id) {
  const d = entry.details || {};
  const c = entry.covers || {};
  const t = entry.text || {};

  const trip = {
    id: id,
    title: entry.title || "",
    date: entry.date || "",
    type: entry.type || "trip",
    country: entry.country || "",
    season: d.season || "",
    days: d.days || 0,
    people: d.people || "",
    places: d.places || "",
    geo: d.geo || "",
    cover: c.cover || "",
    coverAlt: c.coverAlt || "",
    hero: c.hero || "",
    heroAlt: c.heroAlt || "",
    excerpt: t.excerpt || "",
    intro: t.intro || "",
    media: (entry.media || []).map(function (m) {
      const isVideo = !!m.youtubeId || VIDEO_EXT.test(m.src || "");
      const out = {
        kind: isVideo ? "video" : "photo",
        src: m.src || "",
        alt: m.caption || "",
      };
      if (m.youtubeId) out.videoId = m.youtubeId;
      if (m.caption) out.caption = m.caption;
      if (m.quote && m.quote.text) out.quote = m.quote;
      return out;
    }),
  };

  /* пустые поля выбрасываем — сайт их и так проверяет, а файл чище */
  Object.keys(trip).forEach(function (k) {
    if (trip[k] === "" || trip[k] === null) delete trip[k];
  });
  return trip;
}

function build() {
  if (!fs.existsSync(TRIPS_DIR)) {
    throw new Error("Нет папки data/trips — сборка невозможна");
  }

  const files = fs
    .readdirSync(TRIPS_DIR)
    .filter(function (f) { return f.endsWith(".json"); })
    .sort();

  const trips = files.map(function (f) {
    const id = f.replace(/\.json$/, "");
    return flatten(readJson(path.join(TRIPS_DIR, f)), id);
  });

  /* новые сверху */
  trips.sort(function (a, b) {
    return String(b.date || "").localeCompare(String(a.date || ""));
  });

  const site = readJson(SITE_FILE, {});

  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify({ quote: site.quote || {}, trips: trips }, null, 2),
    "utf8"
  );

  console.log("Собрано записей: " + trips.length + " → data/trips.json");
  trips.forEach(function (t) {
    console.log("  " + t.date + "  " + t.title + "  (" + (t.media || []).length + " кадров)");
  });
}

build();
