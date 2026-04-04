#!/usr/bin/env node
/**
 * Delayed dependency updater.
 *
 * Updates dependencies to the latest version that is at least 7 days old,
 * avoiding bleeding-edge releases that might be broken or yanked.
 *
 * Usage:
 *   node scripts/update-deps.js          # dry-run (show what would change)
 *   node scripts/update-deps.js --apply  # actually update package.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DELAY_DAYS = 7;
const PACKAGE_JSON = path.join(__dirname, '..', 'package.json');

function fetchJson(url) {
	return new Promise((resolve, reject) => {
		https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
			let data = '';
			res.on('data', (chunk) => data += chunk);
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch(e) {
					reject(new Error(`Failed to parse response from ${url}`));
				}
			});
		}).on('error', reject);
	});
}

function semverCompare(a, b) {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for(let i = 0; i < 3; i++) {
		if(pa[i] > pb[i]) return 1;
		if(pa[i] < pb[i]) return -1;
	}
	return 0;
}

function extractMajor(version) {
	return parseInt(version.split('.')[0], 10);
}

async function getLatestSafeVersion(packageName, currentRange) {
	const cutoff = new Date(Date.now() - DELAY_DAYS * 24 * 60 * 60 * 1000);

	// Determine the major version constraint from the current range.
	// ^1.2.3 allows 1.x.x, ~1.2.3 allows 1.2.x, etc.
	// We respect the ^ prefix by staying within the same major version.
	const cleaned = currentRange.replace(/^[\^~>=<\s]+/, '');
	const currentMajor = extractMajor(cleaned);
	const useCaret = currentRange.startsWith('^');
	const useTilde = currentRange.startsWith('~');

	const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
	const data = await fetchJson(registryUrl);

	if(!data.time || !data.versions) {
		return null;
	}

	let bestVersion = null;
	for(const [version, publishDate] of Object.entries(data.time)) {
		if(version === 'created' || version === 'modified') continue;
		if(!data.versions[version]) continue;

		const published = new Date(publishDate);
		if(published > cutoff) continue;

		// Skip prereleases
		if(version.includes('-')) continue;

		const major = extractMajor(version);

		// Respect semver range constraints
		if(useCaret && major !== currentMajor) continue;
		if(useTilde) {
			const minor = parseInt(version.split('.')[1], 10);
			const currentMinor = parseInt(cleaned.split('.')[1], 10);
			if(major !== currentMajor || minor !== currentMinor) continue;
		}

		if(!bestVersion || semverCompare(version, bestVersion) > 0) {
			bestVersion = version;
		}
	}

	return bestVersion;
}

async function main() {
	const apply = process.argv.includes('--apply');
	const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
	const allDeps = {
		...pkg.dependencies,
		...pkg.devDependencies,
	};

	console.log(`Checking for updates (older than ${DELAY_DAYS} days)...\n`);

	const updates = [];
	for(const [name, currentRange] of Object.entries(allDeps)) {
		try {
			const best = await getLatestSafeVersion(name, currentRange);
			if(!best) {
				console.log(`  ${name}: could not determine safe version`);
				continue;
			}

			const prefix = currentRange.match(/^[\^~]/)?.[0] || '^';
			const newRange = prefix + best;
			if(newRange !== currentRange) {
				const section = pkg.dependencies?.[name] !== undefined
					? 'dependencies' : 'devDependencies';
				updates.push({ name, section, from: currentRange, to: newRange });
				console.log(`  ${name}: ${currentRange} -> ${newRange}`);
			} else {
				console.log(`  ${name}: up to date (${currentRange})`);
			}
		} catch(e) {
			console.log(`  ${name}: error - ${e.message}`);
		}
	}

	if(updates.length === 0) {
		console.log('\nAll dependencies are up to date.');
		return;
	}

	console.log(`\n${updates.length} update(s) available.`);

	if(apply) {
		for(const { name, section, to } of updates) {
			pkg[section][name] = to;
		}
		fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
		console.log('package.json updated. Run `npm install` to apply.');
	} else {
		console.log('Run with --apply to update package.json.');
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
