import { $ } from 'bun';

await $`rm -rf build`.quiet();

const bundle = await Bun.build({
	entrypoints: ['src/content.ts'],
	target: 'browser',
	format: 'iife',
});

if (!bundle.success) {
	for (const message of bundle.logs) {
		console.error(message);
	}

	throw new AggregateError(bundle.logs, 'content.ts failed to build');
}

const contentJs = await bundle.outputs[0].text();
const manifest = await Bun.file('src/manifest.json').json() as Record<string, unknown>;

/** Chromium ignores Firefox's `browser_specific_settings`, so drop it from that build. */
const manifestEntriesForChromium = Object.entries(manifest)
	.filter(([key]) => key !== 'browser_specific_settings');

const chromiumManifest = Object.fromEntries(manifestEntriesForChromium);

const builds = {
	firefox: manifest,
	chromium: chromiumManifest,
};

for (const [name, targetManifest] of Object.entries(builds)) {
	await Bun.write(`build/${name}/content.js`, contentJs);
	await Bun.write(`build/${name}/manifest.json`, JSON.stringify(targetManifest, null, '\t') + '\n');

	console.log(`Built build/${name}`);
}
