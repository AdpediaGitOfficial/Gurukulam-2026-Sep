import { Global, Module, type OnModuleDestroy, Injectable } from "@nestjs/common";
import { PrismaClient } from "@gurukulam/db";

/**
 * The database handle, wrapped so Nest owns its lifecycle. `@gurukulam/db` is
 * the only package in the repo that talks to PostgreSQL, and this is the only
 * place in the API that constructs a client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
