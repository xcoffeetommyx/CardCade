import { createCardcadeServer } from "./app.js";

const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "4380", 10);
const app = createCardcadeServer();

await app.listen({ host, port });
console.log(`Cardcade is listening on http://${host}:${port}`);

async function shutdown(signal) {
  console.log(`Received ${signal}; closing Cardcade.`);
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
