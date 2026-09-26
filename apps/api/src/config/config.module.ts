import { Global, Module } from "@nestjs/common";
import { ENV, loadEnv } from "./env";

/**
 * Environment is validated once at boot and shared everywhere.
 *
 * Global because nearly every module needs some of it, and threading an
 * import through each one adds ceremony without adding safety.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
