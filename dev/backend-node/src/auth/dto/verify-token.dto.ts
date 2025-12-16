import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VerifyAccessTokenRequest } from '../../contracts/contracts';

export class VerifyTokenDto implements VerifyAccessTokenRequest {
  @ApiProperty({ example: 'A.GUID.xxx', description: 'Access Token' })
  @IsString()
  access_token: string;

  @ApiProperty({ example: 'jiuweihu', description: '调用方应用 ID' })
  @IsString()
  app_id: string;
}
