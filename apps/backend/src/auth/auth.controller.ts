import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import { LoginDto } from './dto/login.dto'
import { MeResponseDto, StatusResponseDto } from './dto/auth-response.dto'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)
  private readonly frontendUrl: string
  private readonly isProduction: boolean

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL')
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production'
  }

  // ─── Email/Password Login ───

  @Post('login')
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: StatusResponseDto })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { jwt, expiresAt } = await this.authService.loginWithPassword(body.email, body.password)
    this.setSessionCookie(res, jwt, expiresAt)
    return { status: 'success' }
  }

  // ─── Facebook OAuth Callback ───

  @Get('callback/facebook')
  async facebookCallback(@Query('code') code: string, @Req() req: Request, @Res() res: Response) {
    try {
      if (!code) {
        this.logger.error('[Facebook Callback] Missing code parameter')
        return res.redirect(`${this.frontendUrl}/auth/callback?status=error&error=missing_code`)
      }

      // Build the redirect URI that was used when initiating the OAuth flow
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host')
      const redirectUri = `${protocol}://${host}/auth/callback/facebook`

      const { jwt, expiresAt } = await this.authService.handleFacebookCallback(code, redirectUri)
      this.setSessionCookie(res, jwt, expiresAt)

      return res.redirect(`${this.frontendUrl}/auth/callback?status=success`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'unexpected_error'
      this.logger.error(`[Facebook Callback] Error: ${errorMsg}`)
      return res.redirect(`${this.frontendUrl}/auth/callback?status=error&error=${errorMsg}`)
    }
  }

  // ─── Instagram OAuth Callback ───

  @Get('callback/instagram')
  async instagramCallback(@Query('code') code: string, @Req() req: Request, @Res() res: Response) {
    try {
      if (!code) {
        this.logger.error('[Instagram Callback] Missing code parameter')
        return res.redirect(`${this.frontendUrl}/auth/callback?status=error&error=missing_code`)
      }

      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host')
      const redirectUri = `${protocol}://${host}/auth/callback/instagram`

      const { jwt, expiresAt } = await this.authService.handleInstagramCallback(code, redirectUri)
      this.setSessionCookie(res, jwt, expiresAt)

      return res.redirect(`${this.frontendUrl}/auth/callback?status=success`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'unexpected_error'
      this.logger.error(`[Instagram Callback] Error: ${errorMsg}`)
      return res.redirect(`${this.frontendUrl}/auth/callback?status=error&error=${errorMsg}`)
    }
  }

  // ─── Get current user ───

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id)
  }

  // ─── Logout ───

  @Post('logout')
  @HttpCode(200)
  @ApiOkResponse({ type: StatusResponseDto })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.session
    if (token) {
      await this.authService.logout(token)
    }

    res.clearCookie('session', {
      path: '/',
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
    })

    return { status: 'success' }
  }

  // ─── Private helpers ───

  private setSessionCookie(res: Response, jwt: string, expiresAt: Date) {
    res.cookie('session', jwt, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    })
  }
}
