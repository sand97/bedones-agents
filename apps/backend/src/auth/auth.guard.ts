import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = request.cookies?.session

    if (!token) {
      throw new UnauthorizedException('Session manquante')
    }

    try {
      const payload = this.jwtService.verify(token)

      // Verify session exists and is not expired
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: true },
      })

      if (!session || session.expiresAt < new Date()) {
        // Clean up expired session
        if (session) {
          await this.prisma.session.delete({ where: { id: session.id } })
        }
        throw new UnauthorizedException('Session expirée')
      }

      request.user = session.user
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('Session invalide')
    }
  }
}
