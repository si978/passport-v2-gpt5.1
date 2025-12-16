import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { AuthException, AuthErrorCode } from './auth-error';
import { ErrorResponse } from '../contracts/contracts';

@Catch(AuthException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: AuthException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    const code = exception.code;
    let status = HttpStatus.BAD_REQUEST;

    if (
      code === AuthErrorCode.ERR_ACCESS_EXPIRED ||
      code === AuthErrorCode.ERR_ACCESS_INVALID ||
      code === AuthErrorCode.ERR_REFRESH_EXPIRED ||
      code === AuthErrorCode.ERR_REFRESH_MISMATCH ||
      code === AuthErrorCode.ERR_SESSION_NOT_FOUND
    ) {
      status = HttpStatus.UNAUTHORIZED;
    } else if (code === AuthErrorCode.ERR_USER_BANNED || code === AuthErrorCode.ERR_APP_ID_MISMATCH) {
      status = HttpStatus.FORBIDDEN;
    } else if (code === AuthErrorCode.ERR_CODE_TOO_FREQUENT) {
      status = HttpStatus.TOO_MANY_REQUESTS;
    } else if (code === AuthErrorCode.ERR_INTERNAL) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const body: ErrorResponse = {
      code,
      message: exception.message,
    };

    res.status(status).json(body);
  }
}
