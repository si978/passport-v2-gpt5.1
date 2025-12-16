import { ContractAuthErrorCode } from '../contracts/contracts';

export enum AuthErrorCode {
  ERR_CODE_INVALID = ContractAuthErrorCode.ERR_CODE_INVALID,
  ERR_CODE_EXPIRED = ContractAuthErrorCode.ERR_CODE_EXPIRED,
  ERR_CODE_TOO_FREQUENT = ContractAuthErrorCode.ERR_CODE_TOO_FREQUENT,
  ERR_PHONE_INVALID = ContractAuthErrorCode.ERR_PHONE_INVALID,
  ERR_USER_BANNED = ContractAuthErrorCode.ERR_USER_BANNED,
  ERR_REFRESH_EXPIRED = ContractAuthErrorCode.ERR_REFRESH_EXPIRED,
  ERR_REFRESH_MISMATCH = ContractAuthErrorCode.ERR_REFRESH_MISMATCH,
  ERR_APP_ID_MISMATCH = ContractAuthErrorCode.ERR_APP_ID_MISMATCH,
  ERR_ACCESS_EXPIRED = ContractAuthErrorCode.ERR_ACCESS_EXPIRED,
  ERR_ACCESS_INVALID = ContractAuthErrorCode.ERR_ACCESS_INVALID,
  ERR_SESSION_NOT_FOUND = ContractAuthErrorCode.ERR_SESSION_NOT_FOUND,
  ERR_INTERNAL = ContractAuthErrorCode.ERR_INTERNAL,
}

export class AuthException extends Error {
  constructor(public code: AuthErrorCode, message?: string) {
    super(message || code);
  }
}
