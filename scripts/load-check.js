/**
 * Release smoke test: require every compiled file in out/ (the extension
 * entry plus all dynamically-loaded plugins) with the 'vscode' host module
 * stubbed. Catches MODULE_NOT_FOUND and other module-init crashes that
 * would otherwise only surface as a silent activation failure in the
 * editor ("command ... not found") or on first use of a plugin.
 *
 * Usage: npm run load-check   (compile first)
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');

const vscodeStub = new Proxy({}, {
    get(target, prop) {
        if (prop === 'version') return '1.99.0';
        if (prop === 'StatusBarAlignment') return { Left: 1, Right: 2 };
        if (prop === 'ViewColumn') return { One: 1, Two: 2, Three: 3 };
        // anything else: a thing that can be called, constructed or dotted into
        return new Proxy(function () {}, {
            get: () => () => undefined,
            construct: () => ({}),
            apply: () => undefined,
        });
    },
});

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') return 'vscode';
    return origResolve.call(this, request, ...rest);
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === 'vscode') return vscodeStub;
    return origLoad.call(this, request, ...rest);
};

const OUT_DIR = path.join(__dirname, '..', 'out');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(
    (e) => e.isDirectory() ? walk(path.join(dir, e.name))
        : (e.name.endsWith('.js') ? [path.join(dir, e.name)] : [])
);

const files = walk(OUT_DIR);
let failures = 0;
for (const f of files) {
    try {
        require(path.resolve(f));
    } catch (e) {
        failures++;
        console.error('FAIL', path.relative(process.cwd(), f), '->', (e.message || String(e)).split('\n')[0]);
    }
}

if (failures) {
    console.error(`${failures} of ${files.length} compiled file(s) failed to load`);
    process.exit(1);
}
console.log(`ALL ${files.length} compiled files load OK`);
