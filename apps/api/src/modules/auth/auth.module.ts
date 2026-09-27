import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LockoutService } from "./lockout.service";
import { PrincipalService } from "./principal.service";

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, LockoutService, PrincipalService],
  exports: [AuthService, PrincipalService, JwtModule],
})
export class AuthModule {}
