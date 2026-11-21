#!/usr/bin/env node
// Management script: uploads the Linkedcamp custom app to Make as a PRIVATE app with @makehq/sdk@1.8.1.
// It runs in your terminal and calls the Make API. It is NOT Make app runtime code.
//
//   node scripts/upload.mjs                 dry run (default): reads and parses every section, prints the
//                                           plan. No network, no SDK import, ignores credentials.
//   node scripts/upload.mjs --live --audience <value> --webhook-type <value> [--app-name linkedcamp]
//                                           creates a NEW private app and uploads every component.
//
// Live mode reads MAKE_API_KEY and MAKE_ZONE (a bare host such as eu1.make.com) from the environment only.
// `audience` and the webhook `type` are never defaulted: take them from your Make account or the Make
// API docs. Automatic retries are off: a failed write has an uncertain outcome; inspect the app in Make
// before re-running. Nothing is rolled back, published, made public or submitted for review. No connection
// is created in any account, no scenario is run and no Linkedcamp API call is made.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAKE_ZONE = /^[a-z0-9-]+\.make\.(?:com|celonis\.com)$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const MODULE_SECTIONS = ['api', 'parameters', 'expect', 'interface', 'samples'];
const RPC_SECTIONS = ['api', 'parameters'];
const WEBHOOK_SECTIONS = ['api', 'parameters', 'attach', 'detach'];
const CONNECTION_SECTIONS = ['api', 'parameters'];

function readSection(rel) {
	const path = join(APP, rel);
	if (!existsSync(path)) throw new Error(`missing ${rel}`);
	const text = readFileSync(path, 'utf8');
	try { JSON.parse(text); } catch { throw new Error(`${rel} is not valid JSON`); }
	return text;
}

export function loadPlan() {
	const manifest = JSON.parse(readFileSync(join(APP, 'app.manifest.json'), 'utf8'));
	const c = manifest.connection;
	return {
		manifest,
		base: readSection('base.imljson'),
		groups: readSection('groups.json'),
		connection: { ...c, sections: Object.fromEntries(CONNECTION_SECTIONS.map((s) => [s, readSection(`connections/${c.name}/${s}.imljson`)])) },
		functions: manifest.functions.map((name) => ({
			name,
			code: readFileSync(join(APP, 'functions', name, 'code.js'), 'utf8'),
			test: readFileSync(join(APP, 'functions', name, 'test.js'), 'utf8'),
		})),
		rpcs: manifest.rpcs.map((r) => ({ ...r, sections: Object.fromEntries(RPC_SECTIONS.map((s) => [s, readSection(`rpcs/${r.name}/${s}.imljson`)])) })),
		webhooks: manifest.webhooks.map((w) => ({ ...w, sections: Object.fromEntries(WEBHOOK_SECTIONS.map((s) => [s, readSection(`webhooks/${w.name}/${s}.imljson`)])) })),
		modules: manifest.modules.map((m) => ({ ...m, sections: Object.fromEntries(MODULE_SECTIONS.map((s) => [s, readSection(`modules/${m.name}/${s}.imljson`)])) })),
	};
}

// Never include error messages or bodies: they can echo credentials or section source.
function describeError(error) {
	const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : undefined;
	if (status === undefined) return 'request failed without a usable response; outcome uncertain, inspect the app in Make before re-running';
	const meaning = status === 400 || status === 422 ? 'rejected as invalid'
		: status === 401 ? 'authentication rejected'
		: status === 403 ? 'permission or scope denied'
		: status === 404 ? 'target not found'
		: status === 409 ? 'conflict (does the app or component already exist?)'
		: status === 429 ? 'rate limited; not retried'
		: status >= 500 ? 'service error; outcome uncertain, inspect the app in Make before re-running'
		: 'unexpected response';
	return `HTTP ${status}: ${meaning}`;
}

class CheckFailure extends Error {}

export async function upload(make, plan, options) {
	const steps = [];
	const step = async (name, fn) => {
		try {
			const value = await fn();
			steps.push({ name, status: 'ok' });
			return { ok: true, value };
		} catch (error) {
			steps.push({ name, status: 'failed', detail: error instanceof CheckFailure ? error.message : describeError(error) });
			return { ok: false };
		}
	};
	const writeRead = async (name, write, read, expected) => {
		if (!(await step(`${name}.write`, write)).ok) return false;
		return (await step(`${name}.readback`, async () => {
			const actual = await read();
			if (typeof actual !== 'string' || actual !== expected) throw new CheckFailure('readback differs from the uploaded source');
		})).ok;
	};

	const run = async () => {
		const { app } = plan.manifest;
		const appName = options.appName;
		let version;

		// 1. App, created private, and confirmed private before anything else is written.
		if (!(await step('app.create', async () => {
			const created = await make.sdk.apps.create({
				name: appName, label: app.label, description: app.description, theme: app.theme, language: app.language,
				private: true, audience: options.audience,
			});
			if (created.name !== appName) throw new CheckFailure('acknowledged app name differs from the request');
			if (created.public === true) throw new CheckFailure('service reported the new app as public; stopping');
			version = created.version;
		})).ok) return;
		if (!(await step('app.verifyPrivate', async () => {
			const full = await make.sdk.apps.get(appName, version, { cols: ['name', 'version', 'public'] });
			if (full.public !== false) throw new CheckFailure('full GET did not confirm the app is private; stopping');
		})).ok) return;

		// 2. Base and groups.
		for (const [section, source] of [['base', plan.base], ['groups', plan.groups]]) {
			if (!(await writeRead(`app.${section}`, () => make.sdk.apps.setSection(appName, version, section, source),
				() => make.sdk.apps.getSection(appName, version, section), source))) return;
		}

		// 3. Connection. Make assigns the stored name; keep it for every binding.
		const conn = await step('connection.create', async () => {
			const created = await make.sdk.connections.create(appName, { type: plan.connection.type, label: plan.connection.label });
			if (!created || !created.name) throw new CheckFailure('connection create returned no name');
			return created.name;
		});
		if (!conn.ok) return;
		const connectionName = conn.value;
		for (const s of CONNECTION_SECTIONS) {
			const src = plan.connection.sections[s];
			if (!(await writeRead(`connection.${s}`, () => make.sdk.connections.setSection(connectionName, s, src),
				() => make.sdk.connections.getSection(connectionName, s), src))) return;
		}

		// 4. Custom IML functions (must be enabled for the account by Make support; see DESIGN.md).
		for (const f of plan.functions) {
			if (!(await step(`function.${f.name}.create`, () => make.sdk.functions.create(appName, version, { name: f.name }))).ok) return;
			if (!(await writeRead(`function.${f.name}.code`, () => make.sdk.functions.setCode(appName, version, f.name, f.code),
				() => make.sdk.functions.getCode(appName, version, f.name), f.code))) return;
			if (!(await step(`function.${f.name}.test`, () => make.sdk.functions.setTest(appName, version, f.name, f.test))).ok) return;
		}

		// 5. RPCs: create, bind the connection, then sections.
		for (const r of plan.rpcs) {
			if (!(await step(`rpc.${r.name}.create`, () => make.sdk.rpcs.create(appName, version, { name: r.name, label: r.label, connection: connectionName }))).ok) return;
			if (!(await step(`rpc.${r.name}.bind`, async () => {
				const updated = await make.sdk.rpcs.update(appName, version, r.name, { connection: connectionName });
				const full = await make.sdk.rpcs.get(appName, version, r.name);
				if ((full && full.connection) !== connectionName && (updated && updated.connection) !== connectionName) throw new CheckFailure('connection binding not confirmed');
			})).ok) return;
			for (const s of RPC_SECTIONS) {
				const src = r.sections[s];
				if (!(await writeRead(`rpc.${r.name}.${s}`, () => make.sdk.rpcs.setSection(appName, version, r.name, s, src),
					() => make.sdk.rpcs.getSection(appName, version, r.name, s), src))) return;
			}
		}

		// 6. Webhooks (dedicated, attached). The create acknowledgement has no name, so find it by label.
		const webhookNames = {};
		for (const w of plan.webhooks) {
			if (!(await step(`webhook.${w.name}.create`, () => make.sdk.webhooks.create(appName, { type: options.webhookType, label: w.label, connection: connectionName }))).ok) return;
			const found = await step(`webhook.${w.name}.lookup`, async () => {
				const matches = (await make.sdk.webhooks.list(appName)).filter((x) => x.label === w.label);
				if (matches.length !== 1) throw new CheckFailure(`expected exactly one webhook labelled "${w.label}", found ${matches.length}`);
				return matches[0].name;
			});
			if (!found.ok) return;
			webhookNames[w.name] = found.value;
			if (!(await step(`webhook.${w.name}.bind`, async () => {
				await make.sdk.webhooks.update(found.value, { connection: connectionName });
				const full = await make.sdk.webhooks.get(found.value);
				if (full.connection !== connectionName) throw new CheckFailure('connection binding not confirmed');
			})).ok) return;
			for (const s of WEBHOOK_SECTIONS) {
				const src = w.sections[s];
				if (!(await writeRead(`webhook.${w.name}.${s}`, () => make.sdk.webhooks.setSection(found.value, s, src),
					() => make.sdk.webhooks.getSection(found.value, s), src))) return;
			}
		}

		// 7. Modules, bound to the connection or (instant triggers) to their webhook.
		for (const m of plan.modules) {
			const binding = m.kind === 'instant' ? { webhook: webhookNames[m.webhook] } : { connection: connectionName };
			if (m.kind === 'instant' && !binding.webhook) { steps.push({ name: `module.${m.name}.create`, status: 'failed', detail: 'webhook missing' }); return; }
			if (!(await step(`module.${m.name}.create`, () => make.sdk.modules.create(appName, version, {
				name: m.name, typeId: m.typeId, label: m.label, description: m.description, moduleInitMode: 'blank', ...binding,
			}))).ok) return;
			for (const s of MODULE_SECTIONS) {
				const src = m.sections[s];
				if (!(await writeRead(`module.${m.name}.${s}`, () => make.sdk.modules.setSection(appName, version, m.name, s, src),
					() => make.sdk.modules.getSection(appName, version, m.name, s), src))) return;
			}
			if (!(await step(`module.${m.name}.verify`, async () => {
				const full = await make.sdk.modules.get(appName, version, m.name);
				if (full.typeId !== m.typeId) throw new CheckFailure('module type differs');
				if (m.kind === 'instant' ? full.webhook !== binding.webhook : full.connection !== connectionName) throw new CheckFailure('binding not confirmed');
				if (full.public === true) throw new CheckFailure('module reported public');
			})).ok) return;
		}

		// 8. Component counts.
		await step('app.counts', async () => {
			const [mods, rpcs, hooks, fns] = await Promise.all([
				make.sdk.modules.list(appName, version), make.sdk.rpcs.list(appName, version),
				make.sdk.webhooks.list(appName), make.sdk.functions.list(appName, version),
			]);
			const want = [plan.modules.length, plan.rpcs.length, plan.webhooks.length, plan.functions.length];
			const got = [mods.length, rpcs.length, hooks.length, fns.length];
			if (want.join() !== got.join()) throw new CheckFailure(`counts modules/rpcs/webhooks/functions: expected ${want.join('/')}, got ${got.join('/')}`);
		});
	};

	await run();
	return { ok: steps.every((s) => s.status === 'ok'), steps };
}

async function main() {
	let values;
	try {
		({ values } = parseArgs({
			strict: true, allowPositionals: false,
			options: { live: { type: 'boolean' }, audience: { type: 'string' }, 'webhook-type': { type: 'string' }, 'app-name': { type: 'string' } },
		}));
	} catch {
		console.error('Unknown or malformed option. See the header of scripts/upload.mjs.');
		return 2;
	}

	let plan;
	try { plan = loadPlan(); } catch (error) { console.error(`Could not load the app sources: ${error.message}`); return 2; }

	if (!values.live) {
		console.log('Mode: dry run. No Make API call was made; credentials in the environment were ignored.');
		console.log(`App ${plan.manifest.app.name}: base, groups, 1 connection (${plan.connection.type}), ${plan.functions.length} functions, ${plan.rpcs.length} RPCs, ${plan.webhooks.length} webhooks, ${plan.modules.length} modules.`);
		for (const m of plan.modules) console.log(`  module ${m.name.padEnd(28)} typeId ${m.typeId}  ${m.kind}${m.webhook ? ` -> ${m.webhook}` : ''}`);
		console.log('Every section parsed as JSON. Use --live (with MAKE_API_KEY, MAKE_ZONE, --audience, --webhook-type) to upload as a private app.');
		return 0;
	}

	const problems = [];
	const apiKey = process.env.MAKE_API_KEY;
	const zone = process.env.MAKE_ZONE;
	const appName = values['app-name'] ?? plan.manifest.app.name;
	if (!apiKey) problems.push('MAKE_API_KEY is not set in the environment.');
	if (!zone) problems.push('MAKE_ZONE is not set in the environment.');
	else if (!MAKE_ZONE.test(zone)) problems.push('MAKE_ZONE must be a bare Make hostname such as eu1.make.com.');
	if (!values.audience) problems.push('--audience is required and never defaulted.');
	if (!values['webhook-type']) problems.push('--webhook-type is required and never defaulted (the Make API does not list its values; confirm the dedicated-webhook type).');
	if (!SAFE_NAME.test(appName)) problems.push('--app-name must be letters, digits, "-" or "_".');
	if (problems.length) { for (const p of problems) console.error(p); return 2; }

	const { Make } = await import('@makehq/sdk');
	const make = new Make(apiKey, zone, { retry: { maxRetries: 0, onRateLimit: false, onServerError: false } });
	const report = await upload(make, plan, { appName, audience: values.audience, webhookType: values['webhook-type'] });
	for (const s of report.steps) console.log(`${s.status.padEnd(7)} ${s.name}${s.detail ? `: ${s.detail}` : ''}`);
	console.log(report.ok
		? 'Result: uploaded and read back. The app is private. Nothing was published, tested live or submitted.'
		: 'Result: FAILED at the last step listed. Completed writes are NOT rolled back; inspect the app in Make before re-running.');
	return report.ok ? 0 : 1;
}

const entry = process.argv[1];
if (entry && fileURLToPath(import.meta.url) === entry) process.exitCode = await main();
