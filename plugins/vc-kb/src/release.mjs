import { hash } from './canonical.mjs';

// Which release line a deployment is running is DERIVED, by comparing what it actually has
// installed against every bundle the registry publishes. Not asserted, and not inferred from the
// environment's name -- the environment called "stable" here turned out to be one whole bundle
// behind the current stable one, and its name said nothing about that.
export function identifyRelease(registry, versions, platformVersion) {
  const installed = new Map(
    [...versions.entries()].filter(([, v]) => v.isInstalled).map(([id, v]) => [id, v.version]),
  );

  const scored = registry.bundles.map((b) => {
    let matched = 0;
    let differed = 0;
    const differences = [];
    for (const [id, version] of installed) {
      const pinned = b.modules[id];
      if (pinned === undefined) continue;
      if (pinned === version) matched++;
      else {
        differed++;
        differences.push({ module: id, deployed: version, pinned });
      }
    }
    const comparable = matched + differed;
    return {
      key: b.key,
      bundleVersion: b.bundleVersion,
      platformVersion: b.platformVersion,
      platformMatches: b.platformVersion === platformVersion,
      modulesPinned: Object.keys(b.modules).length,
      comparable,
      matched,
      differed,
      differences: differences.sort((a, b2) => a.module.localeCompare(b2.module)),
    };
  });

  // "latest" is the registry's own pointer at the current stable bundle. It is a key in the index,
  // so which bundle is current is read, never assumed to be the highest number -- and then it is
  // used and NOT recorded. See the note on `candidates` below for why.
  const current = scored.find((s) => s.key === 'latest') ?? null;

  // Best match, on the module versions rather than on the platform version alone: the platform is
  // one component of a release and the contract is decided by the module mix.
  const ranked = [...scored]
    .filter((s) => s.key !== 'latest' && s.comparable > 0)
    .sort((a, b2) => b2.matched - a.matched || Number(b2.platformMatches) - Number(a.platformMatches));
  const best = ranked[0] ?? null;

  const source = registry.bundles.find((b) => b.key === (best?.key ?? 'latest')) ?? null;

  return {
    registry: {
      // The pinned SOURCE. The registry publishes no tags, so this URL names a branch and the
      // hash below is what makes a past identification auditable after that branch has moved.
      url: registry.registryUrl,
      refIsMovable: true,
      contentHash: hash(registry.index, 16),
      bundlesRead: registry.bundles.length,
    },
    deployment: { platformVersion, modulesInstalled: installed.size },
    identified: best
      ? {
          bundle: best.key,
          bundleVersion: best.bundleVersion,
          platformVersion: best.platformVersion,
          platformMatches: best.platformMatches,
          moduleVersionsMatched: best.matched,
          moduleVersionsComparable: best.comparable,
          // Where this release comes from -- read out of its own manifest, so standing the
          // reference up does not need a second document to be kept in step.
          obtainFrom: source
            ? {
                manifest: source.url,
                platformImage: source.platformImage,
                platformImageTag: source.platformImageTag,
                platformAssetUrl: source.platformAssetUrl,
                moduleSources: source.moduleSources,
                themeB2BVue: source.themeB2BVue,
              }
            : null,
        }
      : null,
    // WHAT THE `latest` POINTER SAYS IS DELIBERATELY NOT RECORDED, neither as its own object nor
    // as a candidate row. Every field it could contribute -- the bundle version, that bundle's
    // platform version, how many modules it matches -- describes wherever the pointer is aimed
    // right now, and moves when the publisher moves it, with nothing about this deployment having
    // changed. Recording it put a moving value inside a byte-compared artifact: `kb check` went
    // red three times in one day on 15.0.14 -> 15.0.15 -> 15.0.16, none of which said anything
    // about the corpus. A gate that fires for reasons unrelated to the thing it guards is ignored
    // within a week, and that is worse than no gate, because it turns a real alarm into noise.
    //
    // Nothing read these fields. What makes a past identification auditable is already here and
    // stays: the registry URL, `refIsMovable`, and the content hash of the index that was read.
    // "Is this deployment on the newest release" is a question whose answer changes without the
    // deployment changing, so it is answered by running the extractor, not by reading a file
    // committed weeks ago. Pin the source, not the value.
    candidates: scored
      .filter((s) => s.key !== 'latest')
      .sort((a, b2) => String(a.key).localeCompare(String(b2.key))),
  };
}
