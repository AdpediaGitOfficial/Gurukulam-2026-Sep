import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ENV, type Env } from "./config/env";
import { buildOpenApiDocument, docsPage } from "./openapi";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // genReqId gives every request an id, which the error filter echoes back —
    // so a user reporting "it failed" hands over something greppable.
    new FastifyAdapter({ trustProxy: true, genReqId: () => crypto.randomUUID() }),
    { bufferLogs: true },
  );

  const env = app.get<Env>(ENV);
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix(env.API_BASE_PATH);

  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });

  // The OpenAPI document is generated from the Zod contracts, so it cannot
  // drift from what the API actually validates. Mobile and third-party
  // consumers build against this.
  const instance = app.getHttpAdapter().getInstance();
  instance.get(`${env.API_BASE_PATH}/openapi.json`, async (_req, reply) => {
    return reply.type("application/json").send(buildOpenApiDocument(env.API_BASE_PATH));
  });
  instance.get(`${env.API_BASE_PATH}/docs`, async (_req, reply) => {
    return reply.type("text/html").send(docsPage(`${env.API_BASE_PATH}/openapi.json`));
  });

  app.enableShutdownHooks();

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  logger.log(`API listening on :${env.API_PORT}${env.API_BASE_PATH}`);
  logger.log(`Docs at :${env.API_PORT}${env.API_BASE_PATH}/docs`);
}

void bootstrap();
