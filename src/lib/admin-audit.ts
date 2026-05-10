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

function extractIpAddress(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.ip ||
    undefined
  );
}

function extractUserAgent(req: NextRequest): string | undefined {
  return req.headers.get("user-agent") || undefined;
}

export async function logSuperAdminAudit(
  req: NextRequest,
  actor: AuditActor,
  input: SuperAdminAuditInput,
  client?: PoolClient,
): Promise<void> {
  const metadata = {
    actorEmail: actor.email ?? undefined,
    actorRole: actor.userType ?? "SUPER_ADMIN",
    userAgent: extractUserAgent(req),
    ...(input.metadata || {}),
  };

  await writeAuditLog(
    {
      action: input.action || "SUPERADMIN_OVERRIDE",
      performedBy: actor.userId,
      societyId: input.societyId ?? undefined,
      targetType: input.targetType,
      targetId: input.targetId ?? undefined,
      oldValue: (input.oldValue as any) ?? undefined,
      newValue: (input.newValue as any) ?? undefined,
      metadata,
      ipAddress: extractIpAddress(req),
    },
    client,
  );
}