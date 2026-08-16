// Quick command-line way to talk to the brain without starting a server.
//
//   npm run ask -- "what is the capital of France?"
//   npm run ask -- --provider groq "write a haiku"

import "dotenv/config";
import { routeStream, availableProviders } from "./router.js";

function parseArgs(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") opts.provider = argv[++i];
    else if (a === "--model") opts.model = argv[++i];
    else rest.push(a);
  }
  opts.prompt = rest.join(" ");
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (!opts.prompt) {
  console.error('Usage: npm run ask -- [--provider NAME] [--model NAME] "your prompt"');
  console.error(`Available providers: ${availableProviders().join(", ") || "(none configured)"}`);
  process.exit(1);
}

try {
  // Stream the reply to stdout as it arrives.
  opts.onDelta = (delta) => process.stdout.write(delta);
  const result = await routeStream(opts);
  process.stdout.write("\n");
  console.error(`\n— via ${result.provider} (${result.model})`);
} catch (err) {
  console.error(`Error: ${err.message || err}`);
  process.exit(1);
}
