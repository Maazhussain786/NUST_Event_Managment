export type PaymentWalletType = "EASYPAISA" | "JAZZCASH" | "BANK";

export interface PaymentWallet {
  id: string;
  wallet_type: PaymentWalletType;
  account_title: string;
  account_number: string | null;
  iban: string | null;
  bank_name: string | null;
  branch_name: string | null;
  instructions: string | null;
  is_enabled: boolean;
  is_default: boolean;
  display_order: number;
}

export interface PaymentDetailsPayload {
  provider: string | null;
  recipient_name: string | null;
  account_number: string | null;
  iban: string | null;
  instructions: string | null;
  configured: boolean;
  active_wallet_id: string | null;
  wallets: PaymentWallet[];
}

type QueryResultLike = { rows: any[] };
type SqlExecutor = (text: string, params?: unknown[]) => Promise<QueryResultLike>;

export const PAYMENT_WALLET_TYPES: PaymentWalletType[] = [
  "EASYPAISA",
  "JAZZCASH",
  "BANK",
];

export function getWalletTypeLabel(type: PaymentWalletType): string {
  if (type === "EASYPAISA") return "Easypaisa";
  if (type === "JAZZCASH") return "JazzCash";
  return "Bank Account";
}

export function normalizeWalletType(value: unknown): PaymentWalletType | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (PAYMENT_WALLET_TYPES.includes(upper as PaymentWalletType)) {
    return upper as PaymentWalletType;
  }
  return null;
}

export function isWalletConfigured(wallet: Pick<PaymentWallet, "wallet_type" | "account_title" | "account_number" | "iban" | "bank_name">): boolean {
  const title = wallet.account_title?.trim();
  if (!title) return false;

  if (wallet.wallet_type === "BANK") {
    return !!wallet.iban?.trim() && !!wallet.bank_name?.trim();
  }

  return !!wallet.account_number?.trim();
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIban(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  return text.replace(/\s+/g, "").toUpperCase();
}

function mapWalletRow(row: Record<string, unknown>): PaymentWallet {
  return {
    id: String(row.id),
    wallet_type: (row.wallet_type as PaymentWalletType) || "BANK",
    account_title: String(row.account_title || ""),
    account_number: asText(row.account_number),
    iban: normalizeIban(row.iban),
    bank_name: asText(row.bank_name),
    branch_name: asText(row.branch_name),
    instructions: asText(row.instructions),
    is_enabled: Boolean(row.is_enabled),
    is_default: Boolean(row.is_default),
    display_order: Number(row.display_order || 0),
  };
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

function isSchemaMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["42P01", "42703"].includes((error as { code?: string }).code || "")
  );
}

function resolveLegacyWalletType(provider: string | null): PaymentWalletType {
  const normalized = (provider || "").toLowerCase();
  if (normalized.includes("easy")) return "EASYPAISA";
  if (normalized.includes("jazz")) return "JAZZCASH";
  return "BANK";
}

function buildLegacyWallet(row: Record<string, unknown>): PaymentWallet | null {
  const provider = asText(row.payment_provider);
  const recipientName = asText(row.payment_recipient_name);
  const accountNumber = asText(row.payment_account_number);
  const iban = normalizeIban(row.payment_iban);
  const instructions = asText(row.payment_instructions);
  const walletType = resolveLegacyWalletType(provider);
  const accountTitle = recipientName || "Society Account";

  const candidate: PaymentWallet = {
    id: "legacy-wallet",
    wallet_type: walletType,
    account_title: accountTitle,
    account_number: accountNumber,
    iban,
    bank_name: walletType === "BANK" ? (provider || "Bank Transfer") : null,
    branch_name: null,
    instructions,
    is_enabled: true,
    is_default: true,
    display_order: 0,
  };

  if (!isWalletConfigured(candidate)) return null;
  return candidate;
}

export function buildLegacyPaymentFields(wallet: PaymentWallet | null): {
  payment_provider: string | null;
  payment_recipient_name: string | null;
  payment_account_number: string | null;
  payment_iban: string | null;
  payment_instructions: string | null;
} {
  if (!wallet) {
    return {
      payment_provider: null,
      payment_recipient_name: null,
      payment_account_number: null,
      payment_iban: null,
      payment_instructions: null,
    };
  }

  return {
    payment_provider: getWalletTypeLabel(wallet.wallet_type),
    payment_recipient_name: wallet.account_title,
    payment_account_number: wallet.account_number,
    payment_iban: wallet.iban,
    payment_instructions: wallet.instructions,
  };
}

export async function listSocietyPaymentWallets(
  runQuery: SqlExecutor,
  societyId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<PaymentWallet[]> {
  const includeDisabled = options.includeDisabled ?? false;
  try {
    const wallets = await runQuery(
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
         ${includeDisabled ? "" : "AND is_enabled = TRUE"}
       ORDER BY is_default DESC, display_order ASC, created_at ASC`,
      [societyId],
    );
    return wallets.rows.map((row) => mapWalletRow(row));
  } catch (error) {
    if (isUndefinedTableError(error)) return [];
    throw error;
  }
}

export async function getSocietyPaymentDetails(
  runQuery: SqlExecutor,
  societyId: string,
): Promise<PaymentDetailsPayload> {
  const wallets = await listSocietyPaymentWallets(runQuery, societyId);

  if (wallets.length > 0) {
    const activeWallet =
      wallets.find((wallet) => wallet.is_default && wallet.is_enabled) ||
      wallets.find((wallet) => wallet.is_enabled) ||
      null;

    const legacy = buildLegacyPaymentFields(activeWallet);
    return {
      provider: legacy.payment_provider,
      recipient_name: legacy.payment_recipient_name,
      account_number: legacy.payment_account_number,
      iban: legacy.payment_iban,
      instructions: legacy.payment_instructions,
      configured: !!activeWallet && isWalletConfigured(activeWallet),
      active_wallet_id: activeWallet?.id || null,
      wallets,
    };
  }

  let legacyRow: Record<string, unknown> = {};
  try {
    const legacyResult = await runQuery(
      `SELECT
         payment_provider,
         payment_recipient_name,
         payment_account_number,
         payment_iban,
         payment_instructions
       FROM society_settings
       WHERE society_id = $1`,
      [societyId],
    );
    legacyRow = legacyResult.rows[0] || {};
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error;
  }
  const legacyWallet = buildLegacyWallet(legacyRow);
  const fallbackWallets = legacyWallet ? [legacyWallet] : [];
  const activeWallet = fallbackWallets[0] || null;
  const legacyFields = buildLegacyPaymentFields(activeWallet);

  return {
    provider: legacyFields.payment_provider,
    recipient_name: legacyFields.payment_recipient_name,
    account_number: legacyFields.payment_account_number,
    iban: legacyFields.payment_iban,
    instructions: legacyFields.payment_instructions,
    configured: !!activeWallet,
    active_wallet_id: activeWallet?.id || null,
    wallets: fallbackWallets,
  };
}
