import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ example: 'A.GUID.xxx', description: '可选，若不提供则从 Authorization 头获取' })
  @IsOptional()
  @IsString()
  access_token?: string;
}
