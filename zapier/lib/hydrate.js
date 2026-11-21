'use strict';

// Turns MCP tool outputs into what Zapier expects: arrays of objects with a
// stable `id`. Output shapes are not documented, so the list property and id
// field per tool come from lib/output-map.json, which scripts/bootstrap.mjs
// writes from real captures. Until then the fallbacks below apply:
//   list: the output itself if it is an array, else its only array-valued
//         top-level property.
//   id:   `_id` (the documented id field of Linkedcamp REST objects), then `id`,
//         then a hash of the item.

const crypto = require('crypto');
const outputMap = require('./output-map.json');

const FALLBACK_ID_KEYS = ['_id', 'id'];

const config = (tool) => (outputMap.tools && outputMap.tools[tool]) || {};

const stableHash = (value) =>
  crypto.createHash('sha1').update(JSON.stringify(value === undefined ? null : value)).digest('hex');

const toList = (output, tool) => {
  if (Array.isArray(output)) return output;
  if (!output || typeof output !== 'object') return [];
  const { listKey } = config(tool);
  if (listKey && Array.isArray(output[listKey])) return output[listKey];
  const arrays = Object.keys(output).filter((k) => Array.isArray(output[k]));
  if (arrays.length === 1) return output[arrays[0]];
  return [];
};

const pickId = (item, tool) => {
  if (!item || typeof item !== 'object') return stableHash(item);
  const { idKey } = config(tool);
  const keys = idKey ? [idKey, ...FALLBACK_ID_KEYS] : FALLBACK_ID_KEYS;
  for (const k of keys) {
    const v = item[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return stableHash(item);
};

// Item → object with Zapier's required `id` (original fields kept).
const withId = (item, tool) => {
  const obj = item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item };
  return { ...obj, id: pickId(obj, tool) };
};

const listWithIds = (output, tool) => toList(output, tool).map((item) => withId(item, tool));

// Single-object outputs (get_*, creates): Zapier wants an object; searches want [obj].
const asObject = (output) =>
  output && typeof output === 'object' && !Array.isArray(output) ? output : { result: output };

module.exports = { toList, pickId, withId, listWithIds, asObject, stableHash };
