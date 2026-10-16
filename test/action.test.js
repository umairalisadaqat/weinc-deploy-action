"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseInputs, buildRequest, run, setOutputs, collectBuiltFiles } = require("../src/lib");

const KEY = "wk_test123";

function tmpDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weinc-dist-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>hi</h1>");
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "logo.png"), Buffer.from([1, 2, 3]));
  return dir;
}

function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const key = `${init.method} ${new URL(url).pathname}`;
    const [status, body] = routes[key] || [404, { error: "not mocked" }];
    return { ok: status < 400, status, statusText: "", text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

test("parseInputs validates key and requirements", () => {
  assert.throws(() => parseInputs({}), /api-key/);
  assert.throws(() => parseInputs({ "INPUT_API-KEY": "sk_x" }), /wk_/);
  assert.throws(() => parseInputs({ "INPUT_API-KEY": KEY, "INPUT_DIST-DIR": "dist" }), /project-id/);
  assert.throws(() => parseInputs({ "INPUT_API-KEY": KEY, "INPUT_PROJECT-ID": "p", "INPUT_API-URL": "http://evil.com" }), /https/);
  const ok = parseInputs({ "INPUT_API-KEY": KEY, "INPUT_PROJECT-ID": " p1 ", "INPUT_DIST-DIR": "dist", INPUT_PUBLISH: "TRUE" });
  assert.deepStrictEqual([ok.projectId, ok.publish, ok.apiUrl], ["p1", true, "https://my.we.inc/api/v1"]);
});

test("buildRequest sets bearer auth and JSON body", () => {
  const { url, init } = buildRequest("https://my.we.inc/api/v1", KEY, "POST", "/projects", { a: 1 });
  assert.strictEqual(url, "https://my.we.inc/api/v1/projects");
  assert.strictEqual(init.headers.Authorization, `Bearer ${KEY}`);
  assert.strictEqual(init.body, '{"a":1}');
});

test("collectBuiltFiles base64-encodes binaries and requires index.html", () => {
  const files = collectBuiltFiles(tmpDist());
  assert.strictEqual(files["index.html"], "<h1>hi</h1>");
  assert.strictEqual(files["assets/logo.png"], Buffer.from([1, 2, 3]).toString("base64"));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "weinc-empty-"));
  assert.throws(() => collectBuiltFiles(empty), /index.html/);
});

test("run creates, publishes and returns the live URL", async () => {
  const f = mockFetch({
    "POST /api/v1/projects": [201, { project: { id: "proj1" }, builder_url: "https://my.we.inc/builder/proj1" }],
    "POST /api/v1/projects/proj1/publish": [200, { url: "https://weinc.app/acme", status: "ready" }],
    "GET /api/v1/projects/proj1/preview": [200, { published_url: "https://weinc.app/acme" }],
  });
  const inputs = parseInputs({ "INPUT_API-KEY": KEY, "INPUT_CLIENT-EMAIL": "a@b.co", INPUT_NAME: "Acme", "INPUT_DIST-DIR": tmpDist() });
  const out = await run(inputs, { fetchImpl: f, log: () => {} });
  assert.deepStrictEqual(out, { "project-id": "proj1", "site-url": "https://weinc.app/acme", "builder-url": "https://my.we.inc/builder/proj1", status: "ready" });
  const pubBody = JSON.parse(f.calls[1].init.body);
  assert.ok(pubBody.builtFiles["index.html"]);
});

test("run surfaces API errors", async () => {
  const f = mockFetch({ "POST /api/v1/projects/p/publish": [403, { error: "You've used all 1 deploy this month" }] });
  const inputs = parseInputs({ "INPUT_API-KEY": KEY, "INPUT_PROJECT-ID": "p", "INPUT_DIST-DIR": tmpDist() });
  await assert.rejects(run(inputs, { fetchImpl: f, log: () => {} }), /403: You've used all/);
});

test("setOutputs writes to GITHUB_OUTPUT", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "weinc-out-")), "out");
  setOutputs({ "site-url": "https://x\ny" }, { GITHUB_OUTPUT: file });
  assert.strictEqual(fs.readFileSync(file, "utf8"), "site-url=https://xy\n");
});
