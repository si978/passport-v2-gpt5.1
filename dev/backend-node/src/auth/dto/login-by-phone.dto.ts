import { IsString, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LoginByPhoneRequest } from '../../contracts/contracts';

export class LoginByPhoneDto implements LoginByPhoneRequest {
  @ApiProperty({ example: '13800138000', description: '用户手机号' })
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/)
  phone: string;

  @ApiProperty({ example: '123456', description: '短信验证码' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({ example: 'jiuweihu', description: '调用方应用 ID' })
  @IsString()
  app_id: string;
}
