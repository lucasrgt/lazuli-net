import { configurationFromEnvironment, createProductionApplication } from "./production.js";

const port = parsePort(process.env.PORT);
const application = await createProductionApplication(configurationFromEnvironment(process.env));
const server = application.app.listen(port, () => {
  console.log(`Skies wallet pilot listening on http://localhost:${port}`);
});

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  server.close();
  await application.close();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3000 : Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("PORT must be an integer between 1 and 65535");
  }
  return port;
}
