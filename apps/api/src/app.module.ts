import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthController } from "./modules/health/health.controller";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { AuthGuard } from "./common/guards/auth.guard";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { SerialiseInterceptor } from "./common/interceptors/serialise.interceptor";
import { ConfigModule } from "./config/config.module";

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [HealthController],
  providers: [
    // Authentication is global and opt-OUT. A new route is protected the
    // moment it exists; forgetting @Public() fails closed.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: SerialiseInterceptor },
  ],
})
export class AppModule {}
