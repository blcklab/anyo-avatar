import type { AvatarDiagnostic, AvatarDiagnosticCode } from './types.js'

export function createAvatarDiagnostic(
  severity: AvatarDiagnostic['severity'],
  code: AvatarDiagnosticCode,
  message: string,
  entityId?: string,
  details?: Readonly<Record<string, unknown>>,
): AvatarDiagnostic {
  return Object.freeze({
    severity,
    code,
    message,
    ...(entityId ? { entityId } : {}),
    ...(details ? { details: Object.freeze({ ...details }) } : {}),
  })
}
