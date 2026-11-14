// @rulecad/fixings: screws, nuts, washers and inserts from rule sets, and the holes and seats they need.
// This first release holds the package's name on npm so the release workflow can publish what follows; the functions
// arrive with 0.1.0. The plan is https://github.com/JoniBach/rulecad/issues/212.

/**
 * What this release is. `release` is `'placeholder'` until the package has functions to call (0.1.0), then `'ready'`:
 * code that wants fixings can test it instead of failing on a missing export.
 * @type {Readonly<{ release: 'placeholder' | 'ready', plan: string }>}
 */
export const status = Object.freeze({ release: 'placeholder', plan: 'https://github.com/JoniBach/rulecad/issues/212' });
