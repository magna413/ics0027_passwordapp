declare module 'speakeasy' {
  export function generateSecret(options: {
    name: string;
    issuer: string;
    length?: number;
  }): {
    secret: string;
    base32: string;
    otpauth_url: string;
  };

  export const totp: {
    verify(options: {
      secret: string;
      encoding: string;
      token: string;
      window?: number;
    }): boolean | null;
  };
}

declare module 'qrcode' {
  export function toDataURL(text: string): Promise<string>;
}
