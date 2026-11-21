#!/usr/bin/env node
// Local harness for the app's custom IML functions (functions/<name>/code.js + test.js).
// The tests use the editor's bare `it()` + `assert` format. Every function is loaded into one
// sandbox and exposed on an `iml` object, so functions that call `iml.parseMcp(...)` work as in Make.
// This is a local JavaScript test, not proof of Make runtime behaviour. No network, no file writes.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'functions');
const names = readdirSync(root).filter((n) => existsSync(join(root, n, 'code.js'))).sort();

let passed = 0;
let failed = 0;
const MAX_CHARS = 5000; // documented custom-function size limit

for (const name of names) {
	const code = readFileSync(join(root, name, 'code.js'), 'utf8');
	if (code.length > MAX_CHARS) {
		console.log(`FAIL ${name}: code.js is ${code.length} characters (limit ${MAX_CHARS})`);
		failed += 1;
	}
	if (/\brequire\s*\(|\bimport\s|\bfetch\s*\(/.test(code)) {
		console.log(`FAIL ${name}: code.js uses require/import/fetch, which the Make runtime does not allow`);
		failed += 1;
	}
}

for (const name of names) {
	const testPath = join(root, name, 'test.js');
	if (!existsSync(testPath)) {
		console.log(`FAIL ${name}: no test.js`);
		failed += 1;
		continue;
	}
	// Fresh sandbox per test file, with every function defined and mirrored on `iml`.
	const tests = [];
	const sandbox = { assert, Buffer, iml: {}, it: (title, fn) => tests.push({ title, fn }) };
	vm.createContext(sandbox);
	for (const fn of names) {
		vm.runInContext(readFileSync(join(root, fn, 'code.js'), 'utf8'), sandbox, { filename: `${fn}/code.js`, timeout: 1000 });
		sandbox.iml[fn] = sandbox[fn];
	}
	vm.runInContext(readFileSync(testPath, 'utf8'), sandbox, { filename: `${name}/test.js`, timeout: 1000 });
	if (tests.length === 0) {
		console.log(`FAIL ${name}: test.js registered no tests`);
		failed += 1;
	}
	for (const t of tests) {
		try {
			t.fn();
			passed += 1;
			console.log(`ok   ${name}: ${t.title}`);
		} catch (error) {
			failed += 1;
			console.log(`FAIL ${name}: ${t.title}\n     ${error.message}`);
		}
	}
}

console.log(`\n${passed} passed, ${failed} failed, ${names.length} functions`);
process.exit(failed === 0 && passed > 0 ? 0 : 1);
