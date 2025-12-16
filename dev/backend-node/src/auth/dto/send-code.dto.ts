import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendCodeDto {
  @ApiProperty({ example: '13800138000', description: '接收验证码的手机号' })
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/)
  phone: string;
}
