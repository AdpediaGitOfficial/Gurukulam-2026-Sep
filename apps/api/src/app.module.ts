import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthController } from "./modules/health/health.controller";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { IdsModule } from "./modules/ids/ids.module";
import { CoursesModule } from "./modules/courses/courses.module";
import { TrainersModule } from "./modules/trainers/trainers.module";
import { CollegesModule } from "./modules/colleges/colleges.module";
import { QuestionsModule } from "./modules/questions/questions.module";
import { HiringModule } from "./modules/hiring/hiring.module";
import { BatchesModule } from "./modules/batches/batches.module";
import { StudentsModule } from "./modules/students/students.module";
import { LedgerModule } from "./modules/ledger/ledger.module";
import { CertificatesModule } from "./modules/certificates/certificates.module";
import { AuthGuard } from "./common/guards/auth.guard";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { SerialiseInterceptor } from "./common/interceptors/serialise.interceptor";
import { ConfigModule } from "./config/config.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    IdsModule,
    AuthModule,
    // The five independent tracks from admin-portal-plan.md §5 — the widest
    // point in the build. None of them depends on another.
    CoursesModule,
    TrainersModule,
    CollegesModule,
    QuestionsModule,
    HiringModule,
    // M6 — delivery. Needs courses, trainers and (for college batches)
    // colleges, so it sits downstream of the five parallel tracks.
    BatchesModule,
    // M7 — enrolment. Needs M6, and carries the allocation transaction.
    StudentsModule,
    // M8 — money. Needs M7's allocation seam and M4's standard market value.
    LedgerModule,
    // M12 — outcomes. Needs M7 plus the attendance signal from M6.
    CertificatesModule,
  ],
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
