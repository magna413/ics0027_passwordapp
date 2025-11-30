type LoginErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOTP'
  | 'NETWORK'
  | 'SERVER'
  | 'OPAQUE'
  | 'UNKNOWN';

type LoginErrorField = 'email' | 'password' | 'totp';

export class LoginError extends Error {
  code: LoginErrorCode;
  field?: LoginErrorField;

  constructor(code: LoginErrorCode, message: string, field?: LoginErrorField) {
    super(message);
    this.name = 'LoginError';
    this.code = code;
    this.field = field;
  }
}
