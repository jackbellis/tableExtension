/* Sort On — value types.
   Reads values that aren't plain numbers so they sort by what they mean:
   dates ("Fri, Oct 30", "Tomorrow 4 AM - 8 AM", "10/30/2026"),
   relative times ("1 hour ago", "3 days ago", "in 2 weeks"),
   and lengths ("1:02:45", "2h 15m", "45 min").
   Everything is local and instant; nothing leaves the page. */
var SortOnTypes = (() => {
  'use strict';

  const DAY = 864e5;
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const WEEKDAY = /\b(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/i;
  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const SPAN = {
    s: 1e3, sec: 1e3, second: 1e3,
    m: 6e4, min: 6e4, minute: 6e4,
    h: 36e5, hr: 36e5, hour: 36e5,
    d: DAY, day: DAY,
    w: 7 * DAY, wk: 7 * DAY, week: 7 * DAY,
    mo: 30.44 * DAY, month: 30.44 * DAY,
    y: 365.25 * DAY, yr: 365.25 * DAY, year: 365.25 * DAY
  };
  const SPAN_RE = '(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)';
  const COUNT_RE = '(\\d+(?:\\.\\d+)?|an?|one)';

  const AGO = new RegExp('\\b' + COUNT_RE + '\\s*' + SPAN_RE + '\\s+ago\\b', 'i');
  const IN = new RegExp('\\bin\\s+' + COUNT_RE + '\\s*' + SPAN_RE + '\\b', 'i');
  const ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
  const MD = new RegExp('\\b' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?', 'i');
  const DM = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RE + '(?:,?\\s+(\\d{4})\\b)?', 'i');
  const MY = new RegExp('\\b' + MONTH_RE + ',?\\s+(\\d{4})\\b', 'i');
  const NUMERIC = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/;
  const CLOCK_TIME = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b\.?/i;
  const MONEY = /[$€£¥]\s?\d/;

  const CLOCK_LEN = /(?:^|[^\d:])(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?![\d:])(?!\s*[ap]\.?m)/i;
  // Words in any case ("45 Min"); single letters only lowercase and attached
  // ("2h 15m"), so "1.2M views" stays a count, not 1.2 minutes.
  const LEN_PART = /(\d+(?:\.\d+)?)(?:\s*([Hh]ours?|[Hh]rs?|[Mm]inutes?|[Mm]ins?|[Ss]econds?|[Ss]ecs?)\b|([hms])\b)/g;

  const countOf = (c) => (/^(an?|one)$/i.test(c) ? 1 : parseFloat(c));
  const spanOf = (u) => {
    const k = u.toLowerCase();
    return SPAN[k] || SPAN[k.replace(/s$/, '')];
  };
  const monthOf = (name) => MONTHS[name.slice(0, 3).toLowerCase()];
  const fullYear = (y) => (y < 100 ? 2000 + y : y);
  const startOfDay = (now) => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const validDay = (m, d) => m >= 0 && m <= 11 && d >= 1 && d <= 31;

  // A month and day with no year: pick the year that puts it nearest today.
  function nearYear(m, d, now) {
    const y = new Date(now).getFullYear();
    let t = new Date(y, m, d).getTime();
    if (t - now > 183 * DAY) t = new Date(y - 1, m, d).getTime();
    else if (now - t > 183 * DAY) t = new Date(y + 1, m, d).getTime();
    return t;
  }

  function calendarDay(s, now) {
    let m = ISO.exec(s);
    if (m && validDay(+m[2] - 1, +m[3])) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    m = MD.exec(s);
    if (m && validDay(monthOf(m[1]), +m[2])) {
      return m[3] ? new Date(+m[3], monthOf(m[1]), +m[2]).getTime() : nearYear(monthOf(m[1]), +m[2], now);
    }
    m = DM.exec(s);
    if (m && validDay(monthOf(m[2]), +m[1])) {
      return m[3] ? new Date(+m[3], monthOf(m[2]), +m[1]).getTime() : nearYear(monthOf(m[2]), +m[1], now);
    }
    m = NUMERIC.exec(s);
    if (m && validDay(+m[1] - 1, +m[2])) {
      return m[3] ? new Date(fullYear(+m[3]), +m[1] - 1, +m[2]).getTime() : nearYear(+m[1] - 1, +m[2], now);
    }
    m = MY.exec(s);
    if (m) return new Date(+m[2], monthOf(m[1]), 1).getTime();
    const today = startOfDay(now);
    if (/\b(tomorrow|overnight)\b/i.test(s)) return today + DAY;
    if (/\byesterday\b/i.test(s)) return today - DAY;
    if (/\b(today|tonight|same[- ]day)\b/i.test(s)) return today;
    m = /\b(one|two|three|four|five|\d+)[- ]day\b/i.exec(s); // shipping badges: "Two-Day", "3-day"
    if (m) {
      const n = { one: 1, two: 2, three: 3, four: 4, five: 5 }[m[1].toLowerCase()] || +m[1];
      return today + n * DAY;
    }
    m = WEEKDAY.exec(s);
    if (m) {
      const want = WEEKDAYS[m[1].slice(0, 3).toLowerCase()];
      return today + ((want - new Date(now).getDay() + 7) % 7) * DAY;
    }
    return null;
  }

  // → { t, past, hasTime } or null
  function parseDate(text, now) {
    if (!text || MONEY.test(text)) return null;
    // Clock time is only meaningful for spans under a day ("3 hours ago", not "2 years ago").
    let m = AGO.exec(text);
    if (m) return { t: now - countOf(m[1]) * spanOf(m[2]), past: true, hasTime: spanOf(m[2]) < DAY };
    m = IN.exec(text);
    if (m) return { t: now + countOf(m[1]) * spanOf(m[2]), past: false, hasTime: spanOf(m[2]) < DAY };
    if (/\bjust now\b|^\s*now\s*$/i.test(text)) return { t: now, past: true, hasTime: true };

    const time = CLOCK_TIME.exec(text);
    let day = calendarDay(text, now);
    if (day == null && !time) return null;
    if (day == null) day = startOfDay(now);
    let t = day;
    if (time) t += ((+time[1] % 12) + (/p/i.test(time[3]) ? 12 : 0)) * 36e5 + (+(time[2] || 0)) * 6e4;
    return { t, past: t <= now, hasTime: !!time };
  }

  // → milliseconds, or null
  function parseLength(text) {
    if (!text || MONEY.test(text) || /\bago\b/i.test(text)) return null;
    let m = CLOCK_LEN.exec(text);
    if (m) return ((+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3]) * 1e3;
    let total = 0;
    let found = false;
    LEN_PART.lastIndex = 0;
    while ((m = LEN_PART.exec(text))) {
      total += parseFloat(m[1]) * spanOf(m[2] || m[3]);
      found = true;
    }
    return found ? total : null;
  }

  function fmtDate(t, hasTime) {
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (new Date(t).getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    if (hasTime) { opts.hour = 'numeric'; opts.minute = '2-digit'; }
    return new Date(t).toLocaleString(undefined, opts);
  }

  function fmtLength(ms) {
    const s = Math.round(ms / 1e3);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h ? h + 'h' : '', m ? m + 'm' : '', sec ? sec + 's' : ''].filter(Boolean).join(' ') || '0s';
  }

  // What kind of value was clicked? 'date' | 'length' | null (leave to the number/text rules).
  function kindOf(text, now) {
    if (parseDate(text, now)) return 'date';
    if (parseLength(text) != null) return 'length';
    return null;
  }

  // Read one cell as the given kind → { key, hint, past } or null.
  function read(text, kind, now) {
    if (kind === 'date') {
      const d = parseDate(text, now);
      return d ? { key: d.t, hint: fmtDate(d.t, d.hasTime), past: d.past } : null;
    }
    if (kind === 'length') {
      const ms = parseLength(text);
      return ms != null ? { key: ms, hint: fmtLength(ms) } : null;
    }
    return null;
  }

  return { kindOf, read, parseDate, parseLength };
})();
