import "reflect-metadata";
import { BadRequestException, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ENV, loadEnv, trustProxyOption, type Env } from "./config/env";
import { buildOpenApiDocument, docsPage } from "./openapi";

async function bootstrap(): Promise<void> {
  // Read once here as well as through the DI container: the adapter's proxy
  // trust has to be decided before the adapter exists.
  const boot = loadEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Which X-Forwarded-For to believe, and it is NOT "anyone's" — see
      // TRUST_PROXY in config/env.ts. With `true`, `req.ip` becomes whatever
      // the caller writes in the header, and the per-caller rate limit that
      // guards login can be stepped over by changing it on each request.
      trustProxy: trustProxyOption(boot.TRUST_PROXY),
      // genReqId gives every request an id, which the error filter echoes back —
      // so a user reporting "it failed" hands over something greppable.
      genReqId: () => crypto.randomUUID(),
    }),
    // Nest registers its own JSON body parser during init, which would
    // collide with the empty-body-tolerant one below.
    { bufferLogs: true, bodyParser: false },
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

  /*
   * Headers on every API response.
   *
   * This API answers with JSON, so most of the browser-facing header set is
   * not its job — but two are. `nosniff` stops a browser deciding a JSON body
   * is really HTML and running it, which is how a reflected value in an error
   * message becomes script. `frame-ancestors 'none'` costs nothing and means
   * no page anywhere can frame a response. The rest of the policy lives on the
   * console, which is what a browser actually renders.
   */
  instance.addHook("onSend", async (_request, reply) => {
    void reply.header("x-content-type-options", "nosniff");
    void reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    void reply.header("referrer-policy", "no-referrer");
    // A JSON API's responses are per-principal. A shared cache holding one is
    // one operator seeing another's roster.
    void reply.header("cache-control", "no-store");
  });

  // Accept an EMPTY body on a request that declares application/json.
  //
  // Fastify's default parser rejects that with an opaque 400, and plenty of
  // HTTP clients set the content type unconditionally — so DELETE /courses/:id
  // and POST /hiring/:id/publish, which take no body at all, would fail for a
  // caller that did nothing wrong. Malformed JSON is still a clean 400.
  instance.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const text = typeof body === "string" ? body.trim() : "";
      if (text === "") return done(null, {});
      try {
        done(null, JSON.parse(text));
      } catch {
        done(new BadRequestException("The request body is not valid JSON"), undefined);
      }
    },
  );
  /*
   * The generated docs, and whether to serve them.
   *
   * These are registered on the Fastify instance directly, which means they do
   * NOT pass through Nest's global auth guard — they are readable by anyone who
   * can reach the port. That is right for a development box and wrong for a
   * deployment: a complete, accurate map of every endpoint and its accepted
   * shapes is the first thing an attacker would otherwise have to reconstruct.
   *
   * So they are on by default and off in production unless asked for.
   */
  if (env.API_DOCS_ENABLED) {
    instance.get(`${env.API_BASE_PATH}/openapi.json`, async (_req, reply) => {
      return reply
        .header("content-security-policy", "default-src 'none'; frame-ancestors 'none'")
        .type("application/json")
        .send(buildOpenApiDocument(env.API_BASE_PATH));
    });
    instance.get(`${env.API_BASE_PATH}/docs`, async (_req, reply) => {
      // The page loads Swagger UI from a CDN, so it needs its own policy
      // rather than the JSON one above.
      return reply
        .header(
          "content-security-policy",
          "default-src 'none'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data:; " +
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        )
        .type("text/html")
        .send(docsPage(`${env.API_BASE_PATH}/openapi.json`));
    });
  } else {
    logger.log("API docs are disabled (API_DOCS_ENABLED=false)");
  }

  app.enableShutdownHooks();

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  logger.log(`API listening on ${env.API_HOST}:${env.API_PORT}${env.API_BASE_PATH}`);
  if (env.API_DOCS_ENABLED) {
    logger.log(`Docs at ${env.API_HOST}:${env.API_PORT}${env.API_BASE_PATH}/docs`);
  }
  if (env.API_HOST === "0.0.0.0") {
    logger.warn(
      "API_HOST is 0.0.0.0 — the API is reachable on every interface. That is only " +
        "correct if a proxy fronts it and TRUST_PROXY names that proxy.",
    );
  }
}

void bootstrap();
