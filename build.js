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

/* ---------------------------------------------------------------
   Размеры картинки читаются прямо из файла — из заголовка, без
   загрузки всего снимка и без сторонних библиотек.
   Нужны, чтобы страница поездки сразу знала, где вертикальный кадр,
   а где широкий, и складывала сетку с первого раза, не прыгая.
   --------------------------------------------------------------- */
function imageSize(file) {
  let buf;
  try {
    const fd = fs.openSync(file, "r");
    buf = Buffer.alloc(65536);
    const read = fs.readSync(fd, buf, 0, 65536, 0);
    fs.closeSync(fd);
    buf = buf.subarray(0, read);
  } catch (err) {
    return null;
  }

  /* PNG: ширина и высота лежат сразу после заголовка IHDR */
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }

  /* JPEG: идём по маркерам до кадрового (SOFn) */
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
      } else {
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  }

  return null;
}

let sized = 0, missed = 0;

function measure(src) {
  if (!src || !src.startsWith("/")) return null;
  const file = path.join(__dirname, src.replace(/^\//, ""));
  const size = imageSize(file);
  if (size && size.w && size.h) { sized++; return size; }
  missed++;
  return null;
}

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

      /* размеры нужны сетке на странице поездки */
      if (!isVideo) {
        const size = measure(m.src);
        if (size) { out.w = size.w; out.h = size.h; }
      }
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
  console.log("Размеры фото прочитаны: " + sized +
              (missed ? ", не найдено файлов: " + missed : ""));
  trips.forEach(function (t) {
    console.log("  " + t.date + "  " + t.title + "  (" + (t.media || []).length + " кадров)");
  });
}

build();
