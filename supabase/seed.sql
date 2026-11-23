-- ============================================================================
-- Slice: Catálogo Inicial de Categorías para Usuario Propietario
-- Usa SECURITY INVOKER + SET search_path = '' para respetar RLS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_default_categories_for_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'Unauthorized seed request';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = p_user_id) THEN
        INSERT INTO public.categories (user_id, name, kind, icon, sort_order)
        VALUES
            (p_user_id, 'Comida & Café', 'expense', 'restaurant', 1),
            (p_user_id, 'Transporte', 'expense', 'directions_subway', 2),
            (p_user_id, 'Súper', 'expense', 'shopping_cart', 3),
            (p_user_id, 'Servicios', 'expense', 'receipt_long', 4),
            (p_user_id, 'Salud', 'expense', 'medical_services', 5),
            (p_user_id, 'Ocio', 'expense', 'theater_comedy', 6),
            (p_user_id, 'Suscripciones', 'expense', 'play_circle', 7),
            (p_user_id, 'Tecnología', 'expense', 'laptop_mac', 8),
            (p_user_id, 'Nómina / Ingreso', 'income', 'work', 9),
            (p_user_id, 'Reembolso / Bono', 'income', 'redeem', 10),
            (p_user_id, 'Arqueo de Saldo', 'system', 'tune', 11),
            (p_user_id, 'Préstamos', 'system', 'handshake', 12);
    END IF;
END;
$$;
