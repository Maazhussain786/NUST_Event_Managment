export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  buildLegacyPaymentFields,
  listSocietyPaymentWallets,
  normalizeWalletType,
  type PaymentWallet,
} from "@/lib/payment-wallets";

const VALID_ROLES = [
  "President",
  "Vice President",
  "Director",
  "Deputy Director",
  "Member",
];

const VALID_POLICIES = ["ALLOWED", "RESTRICTED", "DISABLED"];

interface IncomingWallet {
  id?: string;
  wallet_type?: string;
  account_title?: string;
  account_number?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  branch_name?: string | null;
  instructions?: string | null;
  is_enabled?: boolean;
  is_default?: boolean;
  display_order?: number;
}

function asOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIban(value: unknown): string | null {
  const text = asOptionalText(value);
  if (!text) return null;
  return text.replace(/\s+/g, "").toUpperCase();
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asSafeNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeIncomingWallet(
  wallet: IncomingWallet,
  index: number,
): { ok: true; value: Omit<PaymentWallet, "id"> & { id?: string } } | { ok: false; error: string } {
  const walletType = normalizeWalletType(wallet.wallet_type);
  if (!walletType) {
    return { ok: false, error: `Wallet #${index + 1}: Invalid wallet type` };
  }

  const accountTitle = asOptionalText(wallet.account_title);
  if (!accountTitle) {
    return {
      ok: false,
      error: `Wallet #${index + 1}: Account holder name is required`,
    };
  }

  const accountNumber = asOptionalText(wallet.account_number);
  const iban = normalizeIban(wallet.iban);
  const bankName = asOptionalText(wallet.bank_name);
  const branchName = asOptionalText(wallet.branch_name);
  const instructions = asOptionalText(wallet.instructions);

  if ((walletType === "EASYPAISA" || walletType === "JAZZCASH") && !accountNumber) {
    return {
      ok: false,
      error: `Wallet #${index + 1}: Wallet number is required for ${walletType}`,
    };
  }

  if (walletType === "BANK") {
    if (!iban) {
      return {
        ok: false,
        error: `Wallet #${index + 1}: IBAN is required for bank account`,
      };
    }
    if (!bankName) {
      return {
        ok: false,
        error: `Wallet #${index + 1}: Bank name is required for bank account`,
      };
    }
  }

  return {
    ok: true,
    value: {
      id: asOptionalText(wallet.id) || undefined,
      wallet_type: walletType,
      account_title: accountTitle,
      account_number: accountNumber,
      iban,
      bank_name: bankName,
      branch_name: branchName,
      instructions,
      is_enabled: asBoolean(wallet.is_enabled, true),
      is_default: asBoolean(wallet.is_default, false),
      display_order: asSafeNumber(wallet.display_order, index),
    },
  };
}

async function ensureWalletSchema(client: Awaited<ReturnType<typeof getClient>>) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS society_payment_wallets (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      society_id     UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
      wallet_type    VARCHAR(20) NOT NULL
                    CHECK (wallet_type IN ('EASYPAISA', 'JAZZCASH', 'BANK')),
      account_title  VARCHAR(200) NOT NULL,
      account_number VARCHAR(100),
      iban           VARCHAR(50),
      bank_name      VARCHAR(150),
      branch_name    VARCHAR(150),
      instructions   TEXT,
      is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
      is_default     BOOLEAN NOT NULL DEFAULT FALSE,
      display_order  INTEGER NOT NULL DEFAULT 0,
      created_by     UUID REFERENCES users(id),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_wallet_fields_by_type CHECK (
        (
          wallet_type IN ('EASYPAISA', 'JAZZCASH')
          AND account_number IS NOT NULL
          AND LENGTH(BTRIM(account_number)) > 0
        )
        OR
        (
          wallet_type = 'BANK'
          AND iban IS NOT NULL
          AND LENGTH(BTRIM(iban)) > 0
          AND bank_name IS NOT NULL
          AND LENGTH(BTRIM(bank_name)) > 0
        )
      )
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_society_payment_wallets_society
      ON society_payment_wallets (society_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_society_payment_wallets_enabled
      ON society_payment_wallets (society_id, is_enabled)
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_society_wallet_default_active
      ON society_payment_wallets (society_id)
      WHERE is_default = TRUE AND is_enabled = TRUE
  `);

  await client.query(`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS selected_wallet_id UUID REFERENCES society_payment_wallets(id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tickets_selected_wallet
      ON tickets (selected_wallet_id)
  `);
}

async function buildSettingsResponse(societyId: string) {
  const result = await query(`SELECT * FROM society_settings WHERE society_id = $1`, [
    societyId,
  ]);
  const wallets = await listSocietyPaymentWallets(
    (text, params) => query(text, params),
    societyId,
    { includeDisabled: true },
  );

  const defaults = {
    society_id: societyId,
    event_creation_role: "Director",
    chat_management_role: "Vice President",
    content_upload_role: "Deputy Director",
    ticketing_enabled: true,
    transfer_policy: "ALLOWED",
    transfer_deadline_hours: 24,
    payment_provider: null,
    payment_recipient_name: null,
    payment_account_number: null,
    payment_iban: null,
    payment_instructions: null,
  };

  const settings = result.rows[0] || defaults;
  const activeWallet =
    wallets.find((wallet) => wallet.is_default && wallet.is_enabled) ||
    wallets.find((wallet) => wallet.is_enabled) ||
    null;

  return {
    ...settings,
    payment_wallets: wallets,
    active_wallet_id: activeWallet?.id || null,
  };
}

// GET /api/societies/[id]/settings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = params;

    const membership = await query(
      `SELECT r.hierarchy_level
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, id],
    );

    if (membership.rows.length === 0 && user.userType !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const payload = await buildSettingsResponse(id);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// PATCH /api/societies/[id]/settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: societyId } = params;

    const membership = await client.query(
      `SELECT r.name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId],
    );
    const isPresident = membership.rows.some(
      (entry: { name: string }) => entry.name === "President",
    );

    if (!isPresident && user.userType !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only the President can update settings" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const eventCreationRole = asOptionalText(body.event_creation_role);
    const chatManagementRole = asOptionalText(body.chat_management_role);
    const contentUploadRole = asOptionalText(body.content_upload_role);
    const transferPolicy = asOptionalText(body.transfer_policy);
    const ticketingEnabled =
      typeof body.ticketing_enabled === "boolean" ? body.ticketing_enabled : null;
    const transferDeadlineHours =
      Number.isFinite(Number(body.transfer_deadline_hours))
        ? Number(body.transfer_deadline_hours)
        : null;

    if (eventCreationRole && !VALID_ROLES.includes(eventCreationRole)) {
      return NextResponse.json({ error: "Invalid event_creation_role" }, { status: 400 });
    }
    if (chatManagementRole && !VALID_ROLES.includes(chatManagementRole)) {
      return NextResponse.json({ error: "Invalid chat_management_role" }, { status: 400 });
    }
    if (contentUploadRole && !VALID_ROLES.includes(contentUploadRole)) {
      return NextResponse.json({ error: "Invalid content_upload_role" }, { status: 400 });
    }
    if (transferPolicy && !VALID_POLICIES.includes(transferPolicy)) {
      return NextResponse.json({ error: "Invalid transfer_policy" }, { status: 400 });
    }

    const legacyProvider = asOptionalText(body.payment_provider);
    const legacyRecipient = asOptionalText(body.payment_recipient_name);
    const legacyAccountNumber = asOptionalText(body.payment_account_number);
    const legacyIban = normalizeIban(body.payment_iban);
    const legacyInstructions = asOptionalText(body.payment_instructions);

    const incomingWallets = Array.isArray(body.payment_wallets)
      ? (body.payment_wallets as IncomingWallet[])
      : null;
    const incomingActiveWalletId = asOptionalText(body.active_wallet_id);

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO society_settings (
         society_id,
         event_creation_role,
         chat_management_role,
         content_upload_role,
         ticketing_enabled,
         transfer_policy,
         transfer_deadline_hours,
         payment_provider,
         payment_recipient_name,
         payment_account_number,
         payment_iban,
         payment_instructions
       )
       VALUES (
         $1,
         COALESCE($2, 'Director'),
         COALESCE($3, 'Vice President'),
         COALESCE($4, 'Deputy Director'),
         COALESCE($5, TRUE),
         COALESCE($6, 'ALLOWED'),
         COALESCE($7, 24),
         $8,
         $9,
         $10,
         $11,
         $12
       )
       ON CONFLICT (society_id) DO UPDATE SET
         event_creation_role = COALESCE($2, society_settings.event_creation_role),
         chat_management_role = COALESCE($3, society_settings.chat_management_role),
         content_upload_role = COALESCE($4, society_settings.content_upload_role),
         ticketing_enabled = COALESCE($5, society_settings.ticketing_enabled),
         transfer_policy = COALESCE($6, society_settings.transfer_policy),
         transfer_deadline_hours = COALESCE($7, society_settings.transfer_deadline_hours),
         payment_provider = COALESCE($8, society_settings.payment_provider),
         payment_recipient_name = COALESCE($9, society_settings.payment_recipient_name),
         payment_account_number = COALESCE($10, society_settings.payment_account_number),
         payment_iban = COALESCE($11, society_settings.payment_iban),
         payment_instructions = COALESCE($12, society_settings.payment_instructions),
         updated_at = NOW()`,
      [
        societyId,
        eventCreationRole,
        chatManagementRole,
        contentUploadRole,
        ticketingEnabled,
        transferPolicy,
        transferDeadlineHours,
        legacyProvider,
        legacyRecipient,
        legacyAccountNumber,
        legacyIban,
        legacyInstructions,
      ],
    );

    if (incomingWallets || incomingActiveWalletId) {
      await ensureWalletSchema(client);
    }

    if (incomingWallets) {
      const normalizedWallets: Array<Omit<PaymentWallet, "id"> & { id?: string }> = [];
      const duplicateKeys = new Set<string>();

      for (let i = 0; i < incomingWallets.length; i += 1) {
        const normalized = normalizeIncomingWallet(incomingWallets[i], i);
        if (!normalized.ok) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: normalized.error }, { status: 400 });
        }

        const candidate = normalized.value;
        const dedupeKey = [
          candidate.wallet_type,
          candidate.account_number || "",
          candidate.iban || "",
        ].join("|");
        if (duplicateKeys.has(dedupeKey)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: `Wallet #${i + 1}: Duplicate wallet details are not allowed` },
            { status: 400 },
          );
        }
        duplicateKeys.add(dedupeKey);
        normalizedWallets.push(candidate);
      }

      const existingWallets = await client.query(
        `SELECT id
         FROM society_payment_wallets
         WHERE society_id = $1`,
        [societyId],
      );
      const existingIds = new Set(existingWallets.rows.map((row: { id: string }) => row.id));

      const resolvedWallets: PaymentWallet[] = [];

      for (const wallet of normalizedWallets) {
        if (wallet.id && existingIds.has(wallet.id)) {
          const updated = await client.query(
            `UPDATE society_payment_wallets
             SET wallet_type = $3,
                 account_title = $4,
                 account_number = $5,
                 iban = $6,
                 bank_name = $7,
                 branch_name = $8,
                 instructions = $9,
                 is_enabled = $10,
                 display_order = $11,
                 updated_at = NOW()
             WHERE id = $1 AND society_id = $2
             RETURNING
               id,
               wallet_type,
               account_title,
               account_number,
               iban,
               bank_name,
               branch_name,
               instructions,
               is_enabled,
               is_default,
               display_order`,
            [
              wallet.id,
              societyId,
              wallet.wallet_type,
              wallet.account_title,
              wallet.account_number,
              wallet.iban,
              wallet.bank_name,
              wallet.branch_name,
              wallet.instructions,
              wallet.is_enabled,
              wallet.display_order,
            ],
          );
          if (updated.rows[0]) {
            resolvedWallets.push(updated.rows[0] as PaymentWallet);
          }
        } else {
          const inserted = await client.query(
            `INSERT INTO society_payment_wallets (
               society_id,
               wallet_type,
               account_title,
               account_number,
               iban,
               bank_name,
               branch_name,
               instructions,
               is_enabled,
               is_default,
               display_order,
               created_by
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10, $11)
             RETURNING
               id,
               wallet_type,
               account_title,
               account_number,
               iban,
               bank_name,
               branch_name,
               instructions,
               is_enabled,
               is_default,
               display_order`,
            [
              societyId,
              wallet.wallet_type,
              wallet.account_title,
              wallet.account_number,
              wallet.iban,
              wallet.bank_name,
              wallet.branch_name,
              wallet.instructions,
              wallet.is_enabled,
              wallet.display_order,
              user.userId,
            ],
          );
          if (inserted.rows[0]) {
            resolvedWallets.push(inserted.rows[0] as PaymentWallet);
          }
        }
      }

      const resolvedIds = resolvedWallets.map((wallet) => wallet.id);
      if (resolvedIds.length > 0) {
        await client.query(
          `DELETE FROM society_payment_wallets
           WHERE society_id = $1
             AND id <> ALL($2::uuid[])`,
          [societyId, resolvedIds],
        );
      } else {
        await client.query(`DELETE FROM society_payment_wallets WHERE society_id = $1`, [
          societyId,
        ]);
      }

      const enabledWallets = resolvedWallets.filter((wallet) => wallet.is_enabled);
      let desiredActiveWalletId: string | null = null;

      if (incomingActiveWalletId) {
        const explicit = enabledWallets.find((wallet) => wallet.id === incomingActiveWalletId);
        if (!explicit) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Selected active wallet must be enabled and belong to this society" },
            { status: 400 },
          );
        }
        desiredActiveWalletId = explicit.id;
      } else {
        const preferredInput = normalizedWallets.find(
          (wallet) =>
            wallet.is_enabled &&
            wallet.is_default &&
            wallet.id &&
            enabledWallets.some((resolved) => resolved.id === wallet.id),
        );

        if (preferredInput?.id) {
          desiredActiveWalletId = preferredInput.id;
        } else if (enabledWallets[0]) {
          desiredActiveWalletId = enabledWallets[0].id;
        }
      }

      await client.query(
        `UPDATE society_payment_wallets
         SET is_default = FALSE
         WHERE society_id = $1`,
        [societyId],
      );

      if (desiredActiveWalletId) {
        await client.query(
          `UPDATE society_payment_wallets
           SET is_default = TRUE
           WHERE society_id = $1
             AND id = $2
             AND is_enabled = TRUE`,
          [societyId, desiredActiveWalletId],
        );
      }

      const walletForLegacy = desiredActiveWalletId
        ? enabledWallets.find((wallet) => wallet.id === desiredActiveWalletId) || null
        : null;
      const legacyFromWallet = buildLegacyPaymentFields(walletForLegacy);

      await client.query(
        `UPDATE society_settings
         SET payment_provider = $2,
             payment_recipient_name = $3,
             payment_account_number = $4,
             payment_iban = $5,
             payment_instructions = $6,
             updated_at = NOW()
         WHERE society_id = $1`,
        [
          societyId,
          legacyFromWallet.payment_provider,
          legacyFromWallet.payment_recipient_name,
          legacyFromWallet.payment_account_number,
          legacyFromWallet.payment_iban,
          legacyFromWallet.payment_instructions,
        ],
      );
    } else if (incomingActiveWalletId) {
      const activeWallet = await client.query(
        `SELECT
           id,
           wallet_type,
           account_title,
           account_number,
           iban,
           bank_name,
           branch_name,
           instructions,
           is_enabled,
           is_default,
           display_order
         FROM society_payment_wallets
         WHERE society_id = $1
           AND id = $2
           AND is_enabled = TRUE
         LIMIT 1`,
        [societyId, incomingActiveWalletId],
      );

      if (activeWallet.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Selected active wallet does not exist or is disabled" },
          { status: 400 },
        );
      }

      await client.query(
        `UPDATE society_payment_wallets
         SET is_default = FALSE
         WHERE society_id = $1`,
        [societyId],
      );
      await client.query(
        `UPDATE society_payment_wallets
         SET is_default = TRUE
         WHERE society_id = $1 AND id = $2`,
        [societyId, incomingActiveWalletId],
      );

      const legacyFromWallet = buildLegacyPaymentFields(activeWallet.rows[0]);
      await client.query(
        `UPDATE society_settings
         SET payment_provider = $2,
             payment_recipient_name = $3,
             payment_account_number = $4,
             payment_iban = $5,
             payment_instructions = $6,
             updated_at = NOW()
         WHERE society_id = $1`,
        [
          societyId,
          legacyFromWallet.payment_provider,
          legacyFromWallet.payment_recipient_name,
          legacyFromWallet.payment_account_number,
          legacyFromWallet.payment_iban,
          legacyFromWallet.payment_instructions,
        ],
      );
    }

    await client.query("COMMIT");

    const payload = await buildSettingsResponse(societyId);
    return NextResponse.json(payload);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update settings error:", error);

    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code || "")
        : "";

    if (pgCode === "23514") {
      return NextResponse.json(
        {
          error:
            "Invalid wallet fields. Easypaisa/JazzCash require wallet number. Bank wallet requires IBAN and bank name.",
        },
        { status: 400 },
      );
    }

    if (pgCode === "23505") {
      return NextResponse.json(
        {
          error:
            "Wallet save conflict. Ensure only one preferred default wallet is selected.",
        },
        { status: 409 },
      );
    }

    if (pgCode === "23503") {
      return NextResponse.json(
        {
          error:
            "Wallet reference is invalid. Refresh settings and try again.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  } finally {
    client.release();
  }
}
