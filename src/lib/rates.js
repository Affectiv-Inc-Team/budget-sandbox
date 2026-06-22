// Shared rate-merge helper used by every service-line module.
//
// Each module has a default rate table (the catalog) plus zero or more layers
// of user overrides stored in its config (e.g. config.rateOverrides, and for
// School-Based an additional per-district rateOverrides). The merge rule is
// always the same: start from the defaults, then apply each override layer in
// order, later layers winning. This factory centralizes that rule so the
// modules can't drift apart.
//
// Usage:
//   const effectiveRates = makeEffectiveRates(DDA_RATE_TABLE);
//   effectiveRates(config.rateOverrides);                 // base override
//   effectiveRates(config.rateOverrides, dist.rateOverrides); // layered

/**
 * Build an effective-rate resolver from a default rate definition.
 *
 * @param {Array<{key:string,defaultRate:number}>|Object} defaults
 *   Either a rate-table array (objects with `key` + `defaultRate`) or an
 *   already-flattened `{ key: rate }` map.
 * @returns {(...layers: Array<Object|undefined|null>) => Object}
 *   A resolver that merges the defaults with each override layer in order.
 */
export function makeEffectiveRates(defaults) {
  const base = Array.isArray(defaults)
    ? Object.fromEntries(defaults.map(r => [r.key, r.defaultRate]))
    : { ...defaults };

  return (...layers) =>
    layers.reduce((acc, layer) => ({ ...acc, ...(layer ?? {}) }), { ...base });
}
