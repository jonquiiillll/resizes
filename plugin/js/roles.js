/**
 * Layer roles: every layer in the source document gets tagged with one of these
 * roles before a resize batch runs. The role decides how resizeEngine.js treats
 * the layer for every target size.
 *
 * Roles, based on patterns found across real Sber creatives (SberSpasibo,
 * Vklad, GigaChat, Privilegii):
 *
 *  - background   : always stretched to exactly cover the new canvas
 *  - logo         : pinned to a corner, kept near its original size (small
 *                   downscale allowed only on very small targets)
 *  - legal        : pinned to the bottom edge, spans (nearly) full width,
 *                   scaled down until it fits, wraps as needed
 *  - hero         : the dominant visual (photo / 3D render / collage) - the
 *                   layer we auto-crop/reposition. Anchored on a corner,
 *                   scaled to "cover" using the corner opposite the primary
 *                   text block, so it doesn't fight the text for space
 *  - text_primary : main headline - anchored to a corner (usually top-left),
 *                   uniformly scaled
 *  - text_secondary: secondary headline/CTA - anchored to the corner
 *                   opposite the hero visual (mirrors text_primary by default)
 *  - decor        : optional clutter (small props scattered around the hero).
 *                   Scaled with the hero, and dropped entirely on very small
 *                   canvases so it doesn't collide with text
 *  - unassigned   : left completely alone (not moved, not resized) - use for
 *                   anything the auto pass shouldn't touch
 */

const ROLES = [
  { id: "background", label: "Фон (растянуть)" },
  { id: "logo", label: "Лого (пин в угол)" },
  { id: "legal", label: "Дисклеймер/легал (низ, во всю ширину)" },
  { id: "hero", label: "Хиро-визуал (фото/3D, авто-кроп)" },
  { id: "text_primary", label: "Текст — заголовок" },
  { id: "text_secondary", label: "Текст — саб/CTA (противоположный угол)" },
  { id: "decor", label: "Декор (мелкие объекты, могут скрываться)" },
  { id: "unassigned", label: "Не трогать" }
];

// Keyword hints used to pre-fill a guess when a layer is first seen.
// Matched case-insensitively as substrings against the layer name.
const GUESS_KEYWORDS = [
  { role: "background", words: ["фон", "background", "bg", "подложка", "заливка"] },
  { role: "logo", words: ["лого", "logo"] },
  {
    role: "legal",
    words: [
      "дисклеймер", "легал", "legal", "disclaimer", "реклама",
      "рекламодатель", "лицензия", "0+", "6+", "12+", "16+", "18+"
    ]
  },
  {
    role: "hero",
    words: [
      "3d", "graphics", "герой", "hero", "коллаж", "collage",
      "визуал", "рендер", "render", "фото", "photo"
    ]
  },
  {
    role: "decor",
    words: ["декор", "decor", "clutter", "sparkle", "частиц"]
  },
  {
    role: "text_primary",
    words: ["заголовок", "headline", "title", "выгодный", "текст"]
  },
  {
    role: "text_secondary",
    words: ["саб", "sub", "cta", "подзаголов", "кнопка", "button"]
  }
];

/**
 * Best-effort guess of a role from a layer name. Falls back to "unassigned".
 * @param {string} name
 * @returns {string} role id
 */
function guessRole(name) {
  const lower = (name || "").toLowerCase();
  for (const entry of GUESS_KEYWORDS) {
    if (entry.words.some((w) => lower.includes(w))) {
      return entry.role;
    }
  }
  return "unassigned";
}

module.exports = { ROLES, guessRole };
