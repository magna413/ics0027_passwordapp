import { prisma } from '@/lib/db';

/**
 * Audit log event types
 */
export enum AuditAction {
  // Authentication events
  USER_REGISTERED = 'USER_REGISTERED',
  LOGIN_SUCCESSFUL = 'LOGIN_SUCCESSFUL',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',

  // Password events
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',

  // Credential events
  CREDENTIAL_CREATED = 'CREDENTIAL_CREATED',
  CREDENTIAL_VIEWED = 'CREDENTIAL_VIEWED',
  CREDENTIAL_UPDATED = 'CREDENTIAL_UPDATED',
  CREDENTIAL_DELETED = 'CREDENTIAL_DELETED',

  // Security events
  SUSPICIOUS_LOGIN = 'SUSPICIOUS_LOGIN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SESSION_TIMEOUT = 'SESSION_TIMEOUT',
}

/**
 * Log an audit event
 */
export async function logAuditEvent(
  userId: string | null,
  action: AuditAction,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  try {
    const data: any = {
      action: action.toString(),
      ts: new Date(),
    };
    if (userId) {
      data.userId = userId;
    }
    if (ip) {
      data.ip = ip;
    }
    if (userAgent) {
      data.userAgent = userAgent;
    }

    await (prisma.auditLog.create as any)({ data });
  } catch (error) {
    // Log but don't throw - audit logging should not crash the app
    console.error('Failed to log audit event:', error);
  }
}

/**
 * Get IP address from NextRequest
 */
export function getClientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  const xri = request.headers.get('x-real-ip');
  if (xri) {
    return xri;
  }
  return null;
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: Request): string | null {
  return request.headers.get('user-agent');
}
