/**
 * Target-size presets, pulled directly from real examples we were given
 * (Sber КВ, SberSpasibo, Vklad, GigaChat multi-network resizes).
 * Purely a convenience list for the panel's checkbox grid - any custom
 * WxH can also be added by hand.
 */

const PRESET_GROUPS = [
  {
    label: "Sber КВ / соцсети",
    sizes: [
      { w: 1920, h: 1080 },
      { w: 1080, h: 1920 },
      { w: 1080, h: 1080 },
      { w: 1080, h: 1350 },
      { w: 600, h: 600 }
    ]
  },
  {
    label: "Вклад-style сетка",
    sizes: [
      { w: 1008, h: 840 },
      { w: 1080, h: 607 },
      { w: 1200, h: 1200 },
      { w: 1440, h: 960 },
      { w: 2184, h: 270 },
      { w: 2910, h: 750 },
      { w: 720, h: 1200 },
      { w: 900, h: 1200 },
      { w: 900, h: 1800 },
      { w: 900, h: 750 },
      { w: 960, h: 1140 },
      { w: 960, h: 150 },
      { w: 960, h: 300 }
    ]
  },
  {
    label: "Programmatic / IAB",
    sizes: [
      { w: 300, h: 250 },
      { w: 320, h: 50 },
      { w: 300, h: 50 },
      { w: 240, h: 400 },
      { w: 320, h: 480 },
      { w: 480, h: 320 },
      { w: 600, h: 500 },
      { w: 1200, h: 627 },
      { w: 1200, h: 628 },
      { w: 728, h: 90 },
      { w: 160, h: 600 },
      { w: 970, h: 250 },
      { w: 970, h: 90 },
      { w: 640, h: 100 }
    ]
  },
  {
    label: "Сторис / узкие вертикали",
    sizes: [
      { w: 1080, h: 1920 },
      { w: 264, h: 402 },
      { w: 276, h: 1920 },
      { w: 290, h: 1920 }
    ]
  }
];

module.exports = { PRESET_GROUPS };
