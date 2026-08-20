import { createApiApp } from "./bootstrap.js";
import { loadApiConfig } from "./config.js";
import { JsonLogger } from "@xiongzai/observability";

const config = loadApiConfig();
const logger = new JsonLogger("api");
const app = await createApiApp({ config, logger });
await app.listen({ host: config.host, port: config.port });
logger.info("api_started", { host: config.host, port: config.port, environment: config.environment });
