import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RefreshTokenRequest } from '../../contracts/contracts';

export class RefreshTokenDto implements RefreshTokenRequest {
  @ApiProperty({ example: 'R.abcdef...', description: '刷新令牌' })
  @IsString()
  refresh_token: string;

  @ApiProperty({ example: 'jiuweihu', description: '调用方应用 ID' })
  @IsString()
  app_id: string;

  @ApiProperty({ example: '20251114011234567890', description: '用户 GUID（可来自路径或请求体）', required: false })
  @IsString()
  guid: string;
}
