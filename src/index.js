"use strict";
const { parseInputs, run, setOutputs } = require("./lib");

(async () => {
  try {
    const inputs = parseInputs();
    console.log(`::add-mask::${inputs.apiKey}`);
    const outputs = await run(inputs);
    setOutputs(outputs);
    if (outputs["site-url"]) console.log(`Live site: ${outputs["site-url"]}`);
  } catch (err) {
    console.log(`::error::${(err && err.message) || err}`);
    process.exitCode = 1;
  }
})();
