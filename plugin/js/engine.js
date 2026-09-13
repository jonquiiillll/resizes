/**
 * The auto-resize engine.
 *
 * Takes one source document, a map of roleAssignments (indexPath -> {role,
 * corner?}) and a list of target sizes, and produces one PSD + one exported
 * PNG/JPG per target size. Every layer is repositioned/rescaled with
 * heuristics tuned to what real Sber creatives (SberSpasibo, Vklad,
 * GigaChat, Privilegii КВ) actually do - see roles.js for the reasoning.
 *
 * This is an AUTOPILOT pass, not a final render: it gets composition,
 * anchoring and scale roughly right so a designer only has to do a quick
 * pass (fix the hero crop point, tweak a line break) instead of building
 * every size from scratch.
 */

const { app, core, constants } = require("photoshop");
const { flattenLayers, getLayerByPath } = require("./layerTree");

// ---- tunable constants -----------------------------------------------

const CONFIG = {
  marginRatio: 0.035, // base margin as a fraction of canvas width
  logo: { minScale: 0.55, maxScale: 1.15 },
  legal: { minScale: 0.35, maxScale: 1.5 },
  hero: { minScale: 0.3, maxScale: 3.0, coverFactor: 1.0, overscan: 0.08 },
  text: { minScale: 0.4, maxScale: 1.6 },
  decor: { minAreaRatio: 0.28 } // below this, decor layers are hidden entirely
};

// ---- small geometry helpers -------------------------------------------

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function cornerOf(bounds, canvasW, canvasH) {
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  const horiz = cx < canvasW / 2 ? "left" : "right";
  const vert = cy < canvasH / 2 ? "top" : "bottom";
  return `${vert}-${horiz}`;
}

function oppositeCorner(corner) {
  const [v, h] = corner.split("-");
  const ov = v === "top" ? "bottom" : "top";
  const oh = h === "left" ? "right" : "left";
  return `${ov}-${oh}`;
}

function anchorConstFor(corner) {
  const map = {
    "top-left": constants.AnchorPosition.TOPLEFT,
    "top-right": constants.AnchorPosition.TOPRIGHT,
    "bottom-left": constants.AnchorPosition.BOTTOMLEFT,
    "bottom-right": constants.AnchorPosition.BOTTOMRIGHT
  };
  return map[corner] || constants.AnchorPosition.TOPLEFT;
}

function boundsCornerPoint(bounds, corner) {
  const [v, h] = corner.split("-");
  return {
    x: h === "left" ? bounds.left : bounds.right,
    y: v === "top" ? bounds.top : bounds.bottom
  };
}

function targetCornerPoint(corner, w, h, marginX, marginY) {
  const [v, hz] = corner.split("-");
  return {
    x: hz === "left" ? marginX : w - marginX,
    y: v === "top" ? marginY : h - marginY
  };
}

// ---- layer transform primitive -----------------------------------------

/**
 * Uniformly (or non-uniformly) scale a layer anchored at `corner`, then
 * translate that same corner to `targetPoint`. Scaling anchored at the
 * corner we're about to pin means the corner doesn't move during resize,
 * so a single translate afterwards finishes the job.
 */
async function pinCornerScaled(layer, corner, targetPoint, pctW, pctH) {
  if (pctW !== 100 || pctH !== 100) {
    await layer.resize(pctW, pctH, anchorConstFor(corner));
  }
  const b = layer.bounds;
  const cur = boundsCornerPoint(b, corner);
  const dx = targetPoint.x - cur.x;
  const dy = targetPoint.y - cur.y;
  if (dx !== 0 || dy !== 0) {
    await layer.translate(dx, dy);
  }
}

async function stretchToCanvas(layer, w, h) {
  const b = layer.bounds;
  const curW = b.right - b.left;
  const curH = b.bottom - b.top;
  const pctW = (w / curW) * 100;
  const pctH = (h / curH) * 100;
  if (Math.abs(pctW - 100) > 0.01 || Math.abs(pctH - 100) > 0.01) {
    await layer.resize(pctW, pctH, constants.AnchorPosition.TOPLEFT);
  }
  const nb = layer.bounds;
  await layer.translate(-nb.left, -nb.top);
}

// ---- role handlers -------------------------------------------------------
// Each handler receives (layer, ctx) where ctx carries geometry for this
// specific target size.

const handlers = {
  async background(layer, ctx) {
    await stretchToCanvas(layer, ctx.targetW, ctx.targetH);
  },

  async logo(layer, ctx) {
    const corner = ctx.roleCfg.corner || "top-left";
    const scale = clamp(ctx.uniformScale, CONFIG.logo.minScale, CONFIG.logo.maxScale);
    const point = targetCornerPoint(corner, ctx.targetW, ctx.targetH, ctx.marginX, ctx.marginY);
    await pinCornerScaled(layer, corner, point, scale * 100, scale * 100);
  },

  async legal(layer, ctx) {
    const corner = ctx.roleCfg.corner || "bottom-left";
    const b = layer.bounds;
    const curW = b.right - b.left;
    const desiredW = ctx.targetW - 2 * ctx.marginX;
    let scale = clamp(desiredW / curW, CONFIG.legal.minScale, CONFIG.legal.maxScale);
    const point = targetCornerPoint(corner, ctx.targetW, ctx.targetH, ctx.marginX, ctx.marginY);
    await pinCornerScaled(layer, corner, point, scale * 100, scale * 100);
  },

  async hero(layer, ctx) {
    const corner = ctx.roleCfg.corner || ctx.heroCorner;
    const scale = clamp(
      Math.max(ctx.scaleW, ctx.scaleH) * CONFIG.hero.coverFactor,
      CONFIG.hero.minScale,
      CONFIG.hero.maxScale
    );
    // Let the hero bleed slightly past the edge on its pinned corner side -
    // every real example we inspected overflows the canvas on purpose.
    const overscanX = ctx.targetW * CONFIG.hero.overscan;
    const overscanY = ctx.targetH * CONFIG.hero.overscan;
    const [v, h] = corner.split("-");
    const point = {
      x: h === "left" ? -overscanX : ctx.targetW + overscanX,
      y: v === "top" ? -overscanY : ctx.targetH + overscanY
    };
    await pinCornerScaled(layer, corner, point, scale * 100, scale * 100);
  },

  async decor(layer, ctx) {
    const areaRatio = (ctx.targetW * ctx.targetH) / (ctx.sourceW * ctx.sourceH);
    if (areaRatio < CONFIG.decor.minAreaRatio) {
      layer.visible = false;
      return;
    }
    layer.visible = true;
    const corner = ctx.roleCfg.corner || ctx.heroCorner;
    const scale = clamp(Math.max(ctx.scaleW, ctx.scaleH), CONFIG.hero.minScale, CONFIG.hero.maxScale);
    const point = targetCornerPoint(corner, ctx.targetW, ctx.targetH, -ctx.targetW * 0.05, -ctx.targetH * 0.05);
    await pinCornerScaled(layer, corner, point, scale * 100, scale * 100);
  },

  async text_primary(layer, ctx) {
    const corner = ctx.roleCfg.corner || oppositeCorner(ctx.heroCorner);
    const scale = clamp(ctx.areaScale, CONFIG.text.minScale, CONFIG.text.maxScale);
    const point = targetCornerPoint(corner, ctx.targetW, ctx.targetH, ctx.marginX, ctx.marginY);
    await pinCornerScaled(layer, corner, point, scale * 100, scale * 100);
  },

  async text_secondary(layer, ctx) {
    const corner = ctx.roleCfg.corner || oppositeCorner(ctx.heroCorner);
    const scale = clamp(ctx.areaScale, CONFIG.text.minScale, CONFIG.text.maxScale);
    // Stack below text_primary by default: nudge the margin down a bit so
    // it doesn't land exactly on top of it. A per-layer corner override in
    // the panel lets you flip it to the diagonal-opposite corner instead
    // (the GigaChat/VK "Твой" / "Голосовой помощник" split).
    const extraGap = ctx.marginY * 1.8;
    const point = targetCornerPoint(corner, ctx.targetW, ctx.targetH, ctx.marginX, ctx.marginY + extraGap);
    await pinCornerScaled(layer, corner, point, scale * 100, scale * 100);
  },

  async unassigned() {
    // deliberately a no-op
  }
};

// ---- orchestration --------------------------------------------------------

/**
 * @param {object} sourceDoc active Photoshop document (already open)
 * @param {Map<string,{role:string, corner?:string}>} roleAssignments keyed by pathKey()
 * @param {Array<{w:number,h:number,label?:string}>} targets
 * @param {object} outputFolder a UXP folder entry to write PSD/PNG into
 * @param {object} [options]
 * @param {(msg:string)=>void} [options.onProgress]
 * @param {"png"|"jpg"} [options.exportFormat]
 */
async function generateAll(sourceDoc, roleAssignments, targets, outputFolder, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const exportFormat = options.exportFormat || "png";

  const sourceW = sourceDoc.width;
  const sourceH = sourceDoc.height;

  // Figure out which corner the hero occupies in the *source* document, so
  // text roles can default to the opposite corner.
  const flatSource = flattenLayers(sourceDoc);
  let heroCorner = "bottom-right";
  for (const { layer, indexPath } of flatSource) {
    const cfg = roleAssignments.get(indexPath.join(","));
    if (cfg && cfg.role === "hero") {
      heroCorner = cornerOf(layer.bounds, sourceW, sourceH);
      break;
    }
  }

  for (const target of targets) {
    const label = target.label || `${target.w}x${target.h}`;
    onProgress(`→ ${label}: дублирую документ…`);

    await core.executeAsModal(
      async () => {
        const dup = await sourceDoc.duplicate(`${sourceDoc.name.replace(/\.[^.]+$/, "")}_${target.w}x${target.h}`);

        await dup.resizeCanvas(target.w, target.h, constants.AnchorPosition.TOPLEFT);

        const marginX = CONFIG.marginRatio * target.w;
        const marginY = CONFIG.marginRatio * target.h;
        const scaleW = target.w / sourceW;
        const scaleH = target.h / sourceH;
        const uniformScale = Math.min(scaleW, scaleH);
        const areaScale = Math.sqrt((target.w * target.h) / (sourceW * sourceH));

        const ctx = {
          targetW: target.w,
          targetH: target.h,
          sourceW,
          sourceH,
          marginX,
          marginY,
          scaleW,
          scaleH,
          uniformScale,
          areaScale,
          heroCorner
        };

        const flatDup = flattenLayers(dup);
        for (const { indexPath } of flatDup) {
          const key = indexPath.join(",");
          const cfg = roleAssignments.get(key);
          if (!cfg || !cfg.role || cfg.role === "unassigned") continue;
          const layer = getLayerByPath(dup, indexPath);
          if (!layer) continue;
          const handler = handlers[cfg.role];
          if (!handler) continue;
          try {
            await handler(layer, { ...ctx, roleCfg: cfg });
          } catch (err) {
            onProgress(`  ⚠ слой "${layer.name}" (${cfg.role}): ${err.message}`);
          }
        }

        onProgress(`  сохраняю PSD + ${exportFormat.toUpperCase()}…`);
        const baseName = `${label}`;
        const psdFile = await outputFolder.createFile(`${baseName}.psd`, { overwrite: true });
        await dup.saveAs.psd(psdFile, {}, true);

        const exportFile = await outputFolder.createFile(`${baseName}.${exportFormat}`, { overwrite: true });
        if (exportFormat === "jpg") {
          await dup.saveAs.jpg(exportFile, { quality: 10 }, true);
        } else {
          await dup.saveAs.png(exportFile, {}, true);
        }

        await dup.closeWithoutSaving();
      },
      { commandName: `Auto Resize: ${label}` }
    );

    onProgress(`✓ ${label} готов`);
  }

  onProgress("Готово. Открой сгенерированные PSD в Photoshop и проверь хиро-кроп/переносы текста.");
}

module.exports = { generateAll, CONFIG, cornerOf, oppositeCorner };
