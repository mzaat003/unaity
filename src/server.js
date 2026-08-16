// Starts the unaity web app + chat API. The app itself lives in app.js so it
// can be imported by tests without binding a port.
//
// Start with:  npm start

import "dotenv/config";
import { createApp } from "./app.js";
import { availableProviders } from "./router.js";

const app = createApp();

const port = process.env.PORT || 3000;
// Bind 0.0.0.0 so the app is reachable from phones/laptops on your network.
app.listen(port, "0.0.0.0", () => {
  const providers = availableProviders();
  console.log(`unaity web app on http://localhost:${port}  (also on your LAN IP)`);
  console.log(
    providers.length
      ? `Configured providers: ${providers.join(", ")}`
      : "No providers configured yet — add a key in .env (see .env.example)."
  );
});
