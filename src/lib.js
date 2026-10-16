"use strict";
// Zero-dependency helpers for the WeInc Deploy action.
const fs = require("node:fs");
const path = require("node:path");

// Must match the binary set in the WeInc publish handler: these are sent base64,
// everything else as UTF-8 text.
const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "otf", "eot",
  "webp", "avif", "mp4", "webm", "pdf",
]);

function getInput(name, env = process.env) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return (env[key] ?? "").trim();
}

function parseInputs(env = process.env) {
  const apiKey = getInput("api-key", env);
  if (!apiKey) throw new Error("Input 'api-key' is required.");
  if (!apiKey.startsWith("wk_")) {
    throw new Error("Input 'api-key' must be a WeInc API key starting with 'wk_'.");
  }
  const publishRaw = (getInput("publish", env) || "true").toLowerCase();
  if (!["true", "false"].includes(publishRaw)) {
    throw new Error("Input 'publish' must be 'true' or 'false'.");
  }
  const inputs = {
    apiKey,
    projectId: getInput("project-id", env),
    clientEmail: getInput("client-email", env),
    name: getInput("name", env),
    description: getInput("description", env),
    distDir: getInput("dist-dir", env),
    publish: publishRaw === "true",
    apiUrl: (getInput("api-url", env) || "https://my.we.inc/api/v1").replace(/\/+$/, ""),
  };
  if (!/^https:\/\//.test(inputs.apiUrl) && !/^http:\/\/localhost(:\d+)?\//.test(inputs.apiUrl + "/")) {
    throw new Error("Input 'api-url' must use https.");
  }
  if (!inputs.projectId && (!inputs.clientEmail || !inputs.name)) {
    throw new Error("Provide 'project-id', or both 'client-email' and 'name' to create a new project.");
  }
  if (inputs.publish && !inputs.distDir) {
    throw new Error("Input 'dist-dir' is required when publish is true.");
  }
  return inputs;
}

function collectBuiltFiles(dir) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`dist-dir '${dir}' does not exist or is not a folder. Build your site first.`);
  }
  const files = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        const ext = rel.split(".").pop().toLowerCase();
        const buf = fs.readFileSync(full);
        files[rel] = BINARY_EXTS.has(ext) ? buf.toString("base64") : buf.toString("utf8");
      }
    }
  };
  walk(root);
  if (!files["index.html"]) throw new Error(`dist-dir '${dir}' has no index.html at its root.`);
  return files;
}

function buildRequest(apiUrl, apiKey, method, pathname, body) {
  return {
    url: `${apiUrl}${pathname}`,
    init: {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "weinc-deploy-action/1",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  };
}

async function call(fetchImpl, inputs, method, pathname, body) {
  const { url, init } = buildRequest(inputs.apiUrl, inputs.apiKey, method, pathname, body);
  const res = await fetchImpl(url, init);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText || "request failed";
    throw new Error(`WeInc API ${method} ${pathname} returned ${res.status}: ${msg}`);
  }
  return data;
}

async function run(inputs, { fetchImpl = fetch, log = console.log } = {}) {
  let projectId = inputs.projectId;
  let builderUrl = "";

  if (!projectId) {
    log(`Creating WeInc project "${inputs.name}" for ${inputs.clientEmail}...`);
    const created = await call(fetchImpl, inputs, "POST", "/projects", {
      client_email: inputs.clientEmail,
      name: inputs.name,
      ...(inputs.description ? { description: inputs.description } : {}),
    });
    projectId = created.project && created.project.id;
    if (!projectId) throw new Error("WeInc API did not return a project id.");
    builderUrl = created.builder_url || "";
  }

  let siteUrl = "";
  let status = "skipped";
  if (inputs.publish) {
    const builtFiles = collectBuiltFiles(inputs.distDir);
    log(`Publishing ${Object.keys(builtFiles).length} files to project ${projectId}...`);
    const pub = await call(fetchImpl, inputs, "POST",
      `/projects/${encodeURIComponent(projectId)}/publish`, { builtFiles });
    siteUrl = pub.url || "";
    status = pub.status || "ready";
  }

  const preview = await call(fetchImpl, inputs, "GET",
    `/projects/${encodeURIComponent(projectId)}/preview`);
  if (!siteUrl) siteUrl = preview.published_url || "";
  if (!builderUrl) builderUrl = preview.builder_url || "";

  return { "project-id": projectId, "site-url": siteUrl, "builder-url": builderUrl, status };
}

function setOutputs(outputs, env = process.env) {
  const file = env.GITHUB_OUTPUT;
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${String(v).replace(/[\r\n]/g, "")}`);
  if (file) fs.appendFileSync(file, lines.join("\n") + "\n");
  else lines.forEach((l) => console.log(l));
}

module.exports = { parseInputs, collectBuiltFiles, buildRequest, run, setOutputs, getInput };
