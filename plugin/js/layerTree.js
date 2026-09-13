/**
 * Helpers for walking a document's layer tree in a stable, positional way.
 *
 * We key role assignments by an "index path" (e.g. [2, 0, 1] = 2nd top-level
 * layer -> its 1st child -> that child's 2nd child) rather than by name or
 * layer id. Names collide (lots of "Слой 1" / "Vector Smart Object" in the
 * real files we looked at) and ids change on document.duplicate(), but the
 * structural order of a freshly duplicated document is identical to its
 * source - so positional paths keep working after duplicate().
 */

/**
 * @param {object} doc a Photoshop Document (or Layer acting as a container)
 * @returns {Array<{layer:object, indexPath:number[], depth:number}>}
 */
function flattenLayers(doc) {
  const out = [];

  function walk(layers, prefix, depth) {
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const indexPath = prefix.concat(i);
      out.push({ layer, indexPath, depth });
      if (layer.layers && layer.layers.length) {
        walk(layer.layers, indexPath, depth + 1);
      }
    }
  }

  walk(doc.layers, [], 0);
  return out;
}

/**
 * Re-locate a layer in another document (typically a duplicate) using an
 * index path captured from the original document via flattenLayers().
 * @param {object} doc
 * @param {number[]} indexPath
 * @returns {object|null} the layer, or null if the path no longer resolves
 */
function getLayerByPath(doc, indexPath) {
  let layers = doc.layers;
  let layer = null;
  for (const i of indexPath) {
    if (!layers || i >= layers.length) return null;
    layer = layers[i];
    layers = layer.layers;
  }
  return layer;
}

function pathKey(indexPath) {
  return indexPath.join(",");
}

module.exports = { flattenLayers, getLayerByPath, pathKey };
