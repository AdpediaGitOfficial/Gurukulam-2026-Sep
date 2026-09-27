import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/decorators/principal.decorator";
import { PrismaService } from "../prisma/prisma.module";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — the process is up. Never touches a dependency. */
  @Public()
  @Get()
  live() {
    return { status: "ok", uptime: Math.floor(process.uptime()) };
  }

  /**
   * Readiness — the process can serve traffic. Checks the database, so an
   * instance that cannot reach Postgres is pulled out of the load balancer
   * rather than serving 500s.
   */
  @Public()
  @Get("ready")
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ready" };
  }
}
