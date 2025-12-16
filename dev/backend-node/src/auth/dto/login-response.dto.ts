import { ApiProperty } from '@nestjs/swagger';
import { LoginResponse } from '../../contracts/contracts';

export class LoginResponseDto implements LoginResponse {
  @ApiProperty({ example: 'G1', description: '用户 GUID' })
  guid: string;

  @ApiProperty({ example: 'A.G1.xxx', description: '新的 Access Token' })
  access_token: string;

  @ApiProperty({ example: 'R.xxx', description: '刷新令牌' })
  refresh_token: string;

  @ApiProperty({ example: 1, description: '用户状态：1=ACTIVE,0=BANNED,-1=DELETED' })
  user_status: 1 | 0 | -1;

  @ApiProperty({ example: 'phone', description: '账号来源' })
  account_source: string;

  @ApiProperty({ example: 'user', description: '用户类型（user/admin 等）' })
  user_type: string;

  @ApiProperty({ example: ['OPERATOR'], required: false, description: '管理员角色列表' })
  roles?: string[];

  @ApiProperty({ example: '2025-01-01T10:00:00Z', description: 'Access Token 过期时间' })
  access_token_expires_at: string;

  @ApiProperty({ example: '2025-01-03T10:00:00Z', description: 'Refresh Token 过期时间' })
  refresh_token_expires_at: string;

  /** Access Token 失效时间（秒），与 ACCESS_TTL_HOURS 对齐，当前为 4 小时 = 14400s */
  @ApiProperty({ example: 14400, description: 'Access Token 有效期（秒）' })
  expires_in: number;
}
