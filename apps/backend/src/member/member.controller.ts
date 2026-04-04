import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { MemberService } from './member.service'
import { InvitationService } from '../invitation/invitation.service'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { InviteMemberDto, MemberResponseDto } from './dto/member.dto'

@ApiTags('Members')
@Controller('organisations/:orgId/members')
@UseGuards(AuthGuard)
export class MemberController {
  constructor(
    private memberService: MemberService,
    private invitationService: InvitationService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [MemberResponseDto] })
  async list(@CurrentUser() user: { id: string }, @Param('orgId') orgId: string) {
    const members = await this.memberService.listMembers(user.id, orgId)

    // Generate invite tokens for INVITED members so the frontend can show "copy link"
    return members.map((m) => {
      if (m.status === 'INVITED' && m.user.phone) {
        return {
          ...m,
          inviteToken: this.invitationService.generateInviteToken(orgId, m.user.phone),
        }
      }
      return m
    })
  }

  @Post('invite')
  @ApiBody({ type: InviteMemberDto })
  @ApiCreatedResponse({ type: MemberResponseDto })
  async invite(
    @CurrentUser() user: { id: string },
    @Param('orgId') orgId: string,
    @Body() body: InviteMemberDto,
  ) {
    const member = await this.memberService.inviteMember(user.id, orgId, body)
    const inviteToken = this.invitationService.generateInviteToken(orgId, body.phone)
    return { ...member, inviteToken }
  }

  @Delete(':memberId')
  @ApiOkResponse({ description: 'Membre supprimé' })
  async remove(
    @CurrentUser() user: { id: string },
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.memberService.removeMember(user.id, orgId, memberId)
  }
}
