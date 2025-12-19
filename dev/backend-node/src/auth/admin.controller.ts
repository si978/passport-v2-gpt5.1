import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminService, AdminUserStatus } from './admin.service';
import { MetricsService } from './metrics.service';
import { AuditLogService, AuditLogType } from './audit-log.service';
import { TokenService } from './token.service';
import { AuthGuard } from './auth.guard';
import { AdminAppGuard } from './admin-app.guard';
import { AdminRole, Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@ApiSecurity('app-id')
@UseGuards(AuthGuard, RolesGuard, AdminAppGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditLogService,
    private readonly tokenService: TokenService,
  ) {}

  @Get('users')
  @Roles(AdminRole.OPERATOR, AdminRole.SUPPORT, AdminRole.TECH)
  @ApiOperation({ summary: '查询用户列表' })
  @ApiQuery({ name: 'status', required: false, description: '用户状态：ACTIVE/BANNED/DELETED' })
  async listUsers(@Query('status') status?: string) {
    let statusFilter: AdminUserStatus | undefined;
    if (status === 'ACTIVE' || status === 'BANNED' || status === 'DELETED') {
      statusFilter = status;
    }
    const users = await this.adminService.listUsers(statusFilter);
    return { users };
  }

  @Post('users/:guid/ban')
  @Roles(AdminRole.OPERATOR)
  @ApiOperation({ summary: '封禁用户' })
  async banUser(@Param('guid') guid: string, @Req() req: any): Promise<{ success: true }> {
    await this.adminService.banUser(guid);
    this.audit.recordBan(guid, { operator: req?.user?.guid });
    return { success: true };
  }

  @Post('users/:guid/unban')
  @Roles(AdminRole.OPERATOR)
  @ApiOperation({ summary: '解封用户' })
  async unbanUser(@Param('guid') guid: string, @Req() req: any): Promise<{ success: true }> {
    await this.adminService.unbanUser(guid);
    this.audit.recordUnban(guid, { operator: req?.user?.guid });
    return { success: true };
  }

  @Post('users/:guid/logout')
  @Roles(AdminRole.OPERATOR)
  @ApiOperation({ summary: '后台强制下线用户' })
  async logoutUser(@Param('guid') guid: string, @Req() req: any): Promise<{ success: true }> {
    await this.tokenService.logoutByGuid(guid);
    this.audit.recordLogout({ guid, operator: req?.user?.guid });
    return { success: true };
  }

  @Get('activity')
  @Roles(AdminRole.OPERATOR, AdminRole.SUPPORT, AdminRole.TECH)
  @ApiOperation({ summary: '查询登录活跃记录' })
  @ApiQuery({ name: 'phone', required: false, description: '按手机号过滤' })
  @ApiQuery({ name: 'start', required: false, description: '起始时间（ISO 字符串）' })
  @ApiQuery({ name: 'end', required: false, description: '结束时间（ISO 字符串）' })
  @ApiQuery({ name: 'channel', required: false, description: '登录渠道（pc/mobile等）' })
  async listActivity(
    @Query('phone') phone?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('channel') channel?: string,
  ) {
    const filters: {
      phone?: string;
      start?: Date;
      end?: Date;
      channel?: string;
    } = {};

    if (phone) {
      filters.phone = phone;
    }
    if (channel) {
      filters.channel = channel;
    }
    if (start) {
      const s = new Date(start);
      if (!Number.isNaN(s.getTime())) {
        filters.start = s;
      }
    }
    if (end) {
      const e = new Date(end);
      if (!Number.isNaN(e.getTime())) {
        filters.end = e;
      }
    }

    const activities = await this.adminService.listActivity(filters);
    return { activities };
  }

  @Get('metrics')
  @Roles(AdminRole.OPERATOR, AdminRole.SUPPORT, AdminRole.TECH)
  @ApiOperation({ summary: '获取认证指标快照' })
  async getMetrics() {
    const snapshot = this.metrics.snapshot();
    return { metrics: snapshot };
  }

  @Get('audit-logs')
  @Roles(AdminRole.OPERATOR, AdminRole.SUPPORT, AdminRole.TECH)
  @ApiOperation({ summary: '查询审计日志' })
  @ApiQuery({ name: 'type', required: false, description: 'login/logout/ban/unban/sso_login' })
  @ApiQuery({ name: 'guid', required: false })
  @ApiQuery({ name: 'phone', required: false })
  @ApiQuery({ name: 'start', required: false, description: '起始时间（ISO 字符串）' })
  @ApiQuery({ name: 'end', required: false, description: '结束时间（ISO 字符串）' })
  async listAuditLogs(
    @Query('type') type?: string,
    @Query('guid') guid?: string,
    @Query('phone') phone?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const filters: {
      type?: AuditLogType;
      guid?: string;
      phone?: string;
      start?: Date;
      end?: Date;
    } = {};

    if (type === 'login' || type === 'logout' || type === 'ban' || type === 'unban' || type === 'sso_login') {
      filters.type = type as AuditLogType;
    }
    if (guid) {
      filters.guid = guid;
    }
    if (phone) {
      filters.phone = phone;
    }
    if (start) {
      const s = new Date(start);
      if (!Number.isNaN(s.getTime())) {
        filters.start = s;
      }
    }
    if (end) {
      const e = new Date(end);
      if (!Number.isNaN(e.getTime())) {
        filters.end = e;
      }
    }

    const entries = await this.audit.query(filters);
    return { entries };
  }
}
