import { NextRequest } from "next/server";
import { PoolClient } from "pg";
import { writeAuditLog } from "@/lib/api-utils";

type AuditActor = {
  userId: string;
  email?: string | null;
  userType?: string | null;
};

type SuperAdminAuditInput = {
  action?: string;
  societyId?: string | null;
  targetType: string;
  targetId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

function extractIpAddress(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.ip ||
    null
  );
}

function extractUserAgent(req: NextRequest): string | null {
  return req.headers.get("user-agent") || null;
}

export async function logSuperAdminAudit(
  req: NextRequest,
  actor: AuditActor,
  input: SuperAdminAuditInput,
  client?: PoolClient,
): Promise<void> {
  const metadata = {
    actorEmail: actor.email || null,
    actorRole: actor.userType || "SUPER_ADMIN",
    userAgent: extractUserAgent(req),
    ...(input.metadata || {}),
  };

  await writeAuditLog(
    {
      action: input.action || "SUPERADMIN_OVERRIDE",
      performedBy: actor.userId,
      societyId: input.societyId || null,
      targetType: input.targetType,
      targetId: input.targetId || undefined,
      oldValue: input.oldValue || null,
      newValue: input.newValue || null,
      metadata,
      ipAddress: extractIpAddress(req),
    },
    client,
  );
}