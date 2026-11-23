-- ============================================================================
-- Slice: Migración Inicial 0001 - Esquema Relacional y Políticas RLS
-- Moneda única: MXN (almacenado en centavos enteros BIGINT)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. CUENTAS DE LIQUIDEZ (Efectivo Físico, Débito, Billeteras Digitales)
CREATE TABLE IF NOT EXISTS public.liquidity_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'debit')),
    badge TEXT NOT NULL DEFAULT 'Débito',
    icon TEXT NOT NULL DEFAULT 'account_balance',
    color_hex TEXT NOT NULL DEFAULT '#FFFFFF',
    initial_balance_cents BIGINT NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TARJETAS DE CRÉDITO
CREATE TABLE IF NOT EXISTS public.credit_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    bank_name TEXT NOT NULL CHECK (char_length(trim(bank_name)) > 0),
    last_four CHAR(4) DEFAULT '0000',
    color_hex TEXT NOT NULL DEFAULT '#FFFFFF',
    credit_limit_cents BIGINT CHECK (credit_limit_cents IS NULL OR credit_limit_cents >= 0),
    cutoff_day SMALLINT NOT NULL CHECK (cutoff_day BETWEEN 1 AND 31),
    payment_due_day SMALLINT NOT NULL CHECK (payment_due_day BETWEEN 1 AND 31),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. CATEGORÍAS DE MOVIMIENTO
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'system')),
    icon TEXT NOT NULL DEFAULT 'receipt_long',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. PLANES DE MESES SIN INTERESES (Cabecera de Compra MSI + Soporte Backfill)
CREATE TABLE IF NOT EXISTS public.msi_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    description TEXT NOT NULL CHECK (char_length(trim(description)) > 0),
    merchant TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'credit_card',
    purchase_date DATE NOT NULL,
    defer_to_next_cycle BOOLEAN NOT NULL DEFAULT FALSE,
    total_amount_cents BIGINT NOT NULL CHECK (total_amount_cents > 0),
    total_months SMALLINT NOT NULL CHECK (total_months IN (3, 6, 9, 12, 18, 24)),
    start_installment SMALLINT NOT NULL DEFAULT 1 CHECK (start_installment >= 1 AND start_installment <= total_months),
    first_active_cycle_ym CHAR(7) NOT NULL CHECK (first_active_cycle_ym ~ '^[0-9]{4}-[0-9]{2}$'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. PARCIALIDADES PROYECTADAS DE MSI (Una fila por parcialidad activa X..N)
CREATE TABLE IF NOT EXISTS public.msi_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    msi_plan_id UUID NOT NULL REFERENCES public.msi_plans(id) ON DELETE CASCADE,
    credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE RESTRICT,
    installment_number SMALLINT NOT NULL CHECK (installment_number >= 1),
    total_installments SMALLINT NOT NULL CHECK (total_installments IN (3, 6, 9, 12, 18, 24)),
    cycle_year_month CHAR(7) NOT NULL CHECK (cycle_year_month ~ '^[0-9]{4}-[0-9]{2}$'),
    cycle_cutoff_date DATE NOT NULL,
    payment_due_date DATE NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    is_settled BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (msi_plan_id, installment_number)
);

-- 6. GASTOS FIJOS Y SUSCRIPCIONES RECURRENTES
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    icon TEXT NOT NULL DEFAULT 'event_repeat',
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    billing_day SMALLINT NOT NULL CHECK (billing_day BETWEEN 1 AND 31),
    payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('liquidity_account', 'credit_card')),
    liquidity_account_id UUID REFERENCES public.liquidity_accounts(id) ON DELETE RESTRICT,
    credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_recurring_payment_target CHECK (
        (payment_method_type = 'liquidity_account' AND liquidity_account_id IS NOT NULL AND credit_card_id IS NULL) OR
        (payment_method_type = 'credit_card' AND credit_card_id IS NOT NULL AND liquidity_account_id IS NULL)
    )
);

-- 7. PRÉSTAMOS A TERCEROS ("ME DEBEN")
CREATE TABLE IF NOT EXISTS public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    borrower_name TEXT NOT NULL CHECK (char_length(trim(borrower_name)) > 0),
    description TEXT NOT NULL DEFAULT '',
    origin_account_id UUID NOT NULL REFERENCES public.liquidity_accounts(id) ON DELETE RESTRICT,
    loan_date DATE NOT NULL,
    principal_cents BIGINT NOT NULL CHECK (principal_cents > 0),
    repaid_cents BIGINT NOT NULL DEFAULT 0 CHECK (repaid_cents >= 0 AND repaid_cents <= principal_cents),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. LIBRO MAYOR DE TRANSACCIONES
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tx_type TEXT NOT NULL CHECK (tx_type IN (
        'income',
        'liquidity_expense',
        'card_charge',
        'card_refund',
        'card_payment',
        'account_transfer',
        'balance_adjustment',
        'loan_disbursement',
        'loan_repayment'
    )),
    tx_date DATE NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    adjustment_direction TEXT CHECK (adjustment_direction IN ('inflow', 'outflow')),
    liquidity_account_id UUID REFERENCES public.liquidity_accounts(id) ON DELETE RESTRICT,
    target_liquidity_account_id UUID REFERENCES public.liquidity_accounts(id) ON DELETE RESTRICT,
    credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE RESTRICT,
    defer_to_next_cycle BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_cycle_ym CHAR(7) CHECK (assigned_cycle_ym IS NULL OR assigned_cycle_ym ~ '^[0-9]{4}-[0-9]{2}$'),
    cycle_cutoff_date DATE,
    payment_due_date DATE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    recurring_expense_id UUID REFERENCES public.recurring_expenses(id) ON DELETE SET NULL,
    loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE,
    description TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_tx_consistency_by_type CHECK (
        (tx_type IN ('income', 'liquidity_expense')
            AND liquidity_account_id IS NOT NULL
            AND target_liquidity_account_id IS NULL
            AND credit_card_id IS NULL
            AND adjustment_direction IS NULL)
        OR
        (tx_type IN ('card_charge', 'card_refund')
            AND credit_card_id IS NOT NULL
            AND assigned_cycle_ym IS NOT NULL
            AND liquidity_account_id IS NULL
            AND target_liquidity_account_id IS NULL
            AND adjustment_direction IS NULL)
        OR
        (tx_type = 'card_payment'
            AND liquidity_account_id IS NOT NULL
            AND credit_card_id IS NOT NULL
            AND assigned_cycle_ym IS NOT NULL
            AND target_liquidity_account_id IS NULL
            AND adjustment_direction IS NULL)
        OR
        (tx_type = 'account_transfer'
            AND liquidity_account_id IS NOT NULL
            AND target_liquidity_account_id IS NOT NULL
            AND liquidity_account_id <> target_liquidity_account_id
            AND credit_card_id IS NULL
            AND adjustment_direction IS NULL)
        OR
        (tx_type = 'balance_adjustment'
            AND liquidity_account_id IS NOT NULL
            AND adjustment_direction IS NOT NULL
            AND target_liquidity_account_id IS NULL
            AND credit_card_id IS NULL)
        OR
        (tx_type IN ('loan_disbursement', 'loan_repayment')
            AND liquidity_account_id IS NOT NULL
            AND loan_id IS NOT NULL
            AND target_liquidity_account_id IS NULL
            AND credit_card_id IS NULL
            AND adjustment_direction IS NULL)
    )
);

-- 9. CONTROL MENSUAL DE GASTOS FIJOS
CREATE TABLE IF NOT EXISTS public.recurring_expense_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recurring_expense_id UUID NOT NULL REFERENCES public.recurring_expenses(id) ON DELETE CASCADE,
    year_month CHAR(7) NOT NULL CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
    due_date DATE NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'skipped')),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ,
    UNIQUE (recurring_expense_id, year_month)
);

-- ÍNDICES DE CONSULTA Y LLAVES FORÁNEAS
CREATE INDEX IF NOT EXISTS idx_liq_accounts_user ON public.liquidity_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_user ON public.credit_cards (user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON public.categories (user_id);
CREATE INDEX IF NOT EXISTS idx_msi_plans_user ON public.msi_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_msi_plans_card ON public.msi_plans (credit_card_id);
CREATE INDEX IF NOT EXISTS idx_msi_plans_category ON public.msi_plans (category_id);
CREATE INDEX IF NOT EXISTS idx_msi_inst_user_card_cycle ON public.msi_installments (user_id, credit_card_id, cycle_year_month);
CREATE INDEX IF NOT EXISTS idx_msi_inst_card ON public.msi_installments (credit_card_id);
CREATE INDEX IF NOT EXISTS idx_rec_exp_user ON public.recurring_expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_rec_exp_cat ON public.recurring_expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_rec_exp_liq ON public.recurring_expenses (liquidity_account_id);
CREATE INDEX IF NOT EXISTS idx_rec_exp_card ON public.recurring_expenses (credit_card_id);
CREATE INDEX IF NOT EXISTS idx_rec_logs_user_ym ON public.recurring_expense_logs (user_id, year_month);
CREATE INDEX IF NOT EXISTS idx_rec_logs_tx ON public.recurring_expense_logs (transaction_id);
CREATE INDEX IF NOT EXISTS idx_loans_user_status ON public.loans (user_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_origin_acc ON public.loans (origin_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON public.transactions (user_id, tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_card_cycle ON public.transactions (user_id, credit_card_id, assigned_cycle_ym);
CREATE INDEX IF NOT EXISTS idx_tx_user_liquidity ON public.transactions (user_id, liquidity_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_liquidity_acc ON public.transactions (liquidity_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_target_liquidity_acc ON public.transactions (target_liquidity_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_credit_card ON public.transactions (credit_card_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_tx_recurring_exp ON public.transactions (recurring_expense_id);
CREATE INDEX IF NOT EXISTS idx_tx_loan ON public.transactions (loan_id);

-- ROW LEVEL SECURITY (RLS) ESTRICTO PARA USUARIO ÚNICO (con initPlan caching `(select auth.uid())`)
ALTER TABLE public.liquidity_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msi_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msi_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_full_access_liquidity_accounts" ON public.liquidity_accounts;
CREATE POLICY "owner_full_access_liquidity_accounts" ON public.liquidity_accounts
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_credit_cards" ON public.credit_cards;
CREATE POLICY "owner_full_access_credit_cards" ON public.credit_cards
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_categories" ON public.categories;
CREATE POLICY "owner_full_access_categories" ON public.categories
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_msi_plans" ON public.msi_plans;
CREATE POLICY "owner_full_access_msi_plans" ON public.msi_plans
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_msi_installments" ON public.msi_installments;
CREATE POLICY "owner_full_access_msi_installments" ON public.msi_installments
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "owner_full_access_recurring_expenses" ON public.recurring_expenses
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_recurring_expense_logs" ON public.recurring_expense_logs;
CREATE POLICY "owner_full_access_recurring_expense_logs" ON public.recurring_expense_logs
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_loans" ON public.loans;
CREATE POLICY "owner_full_access_loans" ON public.loans
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "owner_full_access_transactions" ON public.transactions;
CREATE POLICY "owner_full_access_transactions" ON public.transactions
    FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);


-- PERMISOS PARA EL ROL AUTHENTICATED (Protegido por RLS)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.liquidity_accounts,
    public.credit_cards,
    public.categories,
    public.msi_plans,
    public.msi_installments,
    public.recurring_expenses,
    public.recurring_expense_logs,
    public.loans,
    public.transactions
TO authenticated;
