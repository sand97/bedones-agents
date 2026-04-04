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
  //
  // This callback receives the OAuth code from Facebook after the user
  // authorises. It forwards the code to the frontend which decides what
  // to do based on the intent stored in localStorage:
  //   • "connect_pages" → frontend calls POST /social/connect/facebook
  //   • "login"         → (not implemented yet — email/password only for now)
  //   • "onboarding"    → frontend calls POST /social/connect/facebook

  @Get('callback/facebook')
  async facebookCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      this.logger.error('[Facebook Callback] Missing code parameter')
      return res.redirect(`${this.frontendUrl}/auth/callback?status=error&error=missing_code`)
    }

    this.logger.log(`[Facebook Callback] Received code, forwarding to frontend`)
    return res.redirect(
      `${this.frontendUrl}/auth/callback?status=success&code=${encodeURIComponent(code)}`,
    )
  }

  // ─── Instagram OAuth Callback ───

  @Get('callback/instagram')
  async instagramCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      this.logger.error('[Instagram Callback] Missing code parameter')
      return res.redirect(`${this.frontendUrl}/auth/callback?status=error&error=missing_code`)
    }

    this.logger.log(`[Instagram Callback] Received code, forwarding to frontend`)
    return res.redirect(
      `${this.frontendUrl}/auth/callback?status=success&code=${encodeURIComponent(code)}`,
    )
  }

  // ─── TikTok OAuth Callback ───

  @Get('callback/tiktok')
  async tiktokCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      this.logger.error('[TikTok Callback] Missing code parameter')
      return res.redirect(`${this.frontendUrl}/auth/callback?status=error&error=missing_code`)
    }

    this.logger.log(`[TikTok Callback] Received code, forwarding to frontend`)
    return res.redirect(
      `${this.frontendUrl}/auth/callback?status=success&code=${encodeURIComponent(code)}`,
    )
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
