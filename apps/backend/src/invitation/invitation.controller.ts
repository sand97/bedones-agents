import { Body, Controller, Get, Headers, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { InvitationService } from './invitation.service'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { VerifyInviteOtpDto, AcceptInvitationDto } from '../member/dto/member.dto'

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationController {
  private readonly isProduction: boolean

  constructor(
    private invitationService: InvitationService,
    private configService: ConfigService,
  ) {
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production'
  }

  /** Get invitation info from JWT token (public — no auth required) */
  @Get()
  @ApiOkResponse({ description: 'Invitation details' })
  async getInvitation(@Query('token') token: string) {
    return this.invitationService.getInvitation(token)
  }

  /** Send OTP to the invited phone number (public) */
  @Post('send-otp')
  @ApiOkResponse({ description: 'OTP sent' })
  async sendOtp(@Query('token') token: string, @Headers('accept-language') acceptLang?: string) {
    const lang = acceptLang?.startsWith('en') ? 'en' : 'fr'
    return this.invitationService.sendOtp(token, lang)
  }

  /** Verify OTP → set user VERIFIED → return user info + set auth cookie (public) */
  @Post('verify-otp')
  @ApiOkResponse({ description: 'OTP verified, user authenticated' })
  async verifyOtp(
    @Query('token') token: string,
    @Body() body: VerifyInviteOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.invitationService.verifyOtp(token, body.code)

    // Set auth cookie
    res.cookie('session', result.session.jwt, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      expires: result.session.expiresAt,
    })

    return { user: result.user }
  }

  /** Accept invitation (authenticated) */
  @Post('accept')
  @UseGuards(AuthGuard)
  @ApiOkResponse({ description: 'Invitation accepted' })
  async accept(
    @CurrentUser() user: { id: string },
    @Query('orgId') orgId: string,
    @Body() body: AcceptInvitationDto,
  ) {
    const name =
      body.firstName || body.lastName
        ? `${body.firstName || ''} ${body.lastName || ''}`.trim()
        : undefined
    return this.invitationService.acceptInvitation(user.id, orgId, name)
  }

  /** Reject invitation (authenticated) */
  @Post('reject')
  @UseGuards(AuthGuard)
  @ApiOkResponse({ description: 'Invitation rejected' })
  async reject(@CurrentUser() user: { id: string }, @Query('orgId') orgId: string) {
    return this.invitationService.rejectInvitation(user.id, orgId)
  }
}
