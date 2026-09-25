-- Deposit policy:
-- Wallet deposits must be at least UGX 5,000.
-- The API validates sender identity details for AQE Manager Direct requests.
-- Keep historical rows compatible when paymentKind was not recorded.

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_wallet_deposit_minimum;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_wallet_deposit_minimum
  CHECK (
    COALESCE(metadata->>'paymentKind', '') <> 'wallet_deposit'
    OR amount >= 5000
  );
