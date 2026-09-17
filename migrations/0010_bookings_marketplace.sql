CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  service text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'disputed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  title text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price > 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  inventory integer NOT NULL DEFAULT 1 CHECK (inventory >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS bookings_provider_id_idx ON public.bookings(provider_id);
CREATE INDEX IF NOT EXISTS marketplace_products_seller_id_idx ON public.marketplace_products(seller_id);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_select_participant_or_manager ON public.bookings;
CREATE POLICY bookings_select_participant_or_manager ON public.bookings FOR SELECT
  USING (customer_id = auth.uid() OR provider_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS bookings_insert_customer ON public.bookings;
CREATE POLICY bookings_insert_customer ON public.bookings FOR INSERT
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS bookings_update_participant_or_manager ON public.bookings;
CREATE POLICY bookings_update_participant_or_manager ON public.bookings FOR UPDATE
  USING (customer_id = auth.uid() OR provider_id = auth.uid() OR public.is_aqe_manager())
  WITH CHECK (customer_id = auth.uid() OR provider_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS marketplace_products_select_active_or_owner ON public.marketplace_products;
CREATE POLICY marketplace_products_select_active_or_owner ON public.marketplace_products FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS marketplace_products_insert_owner ON public.marketplace_products;
CREATE POLICY marketplace_products_insert_owner ON public.marketplace_products FOR INSERT
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS marketplace_products_update_owner_or_manager ON public.marketplace_products;
CREATE POLICY marketplace_products_update_owner_or_manager ON public.marketplace_products FOR UPDATE
  USING (seller_id = auth.uid() OR public.is_aqe_manager())
  WITH CHECK (seller_id = auth.uid() OR public.is_aqe_manager());