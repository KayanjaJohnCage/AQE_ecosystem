insert into public.payment_receivers(receiver_name,receiver_phone,receiver_card,network,instructions,status)
select receiver_name,receiver_phone,receiver_card,'Mukuru',instructions,'available'
from public.payment_receiver_settings
where id=1
and btrim(receiver_name)<>'' and btrim(receiver_phone)<>'' and btrim(receiver_card)<>''
and not exists (select 1 from public.payment_receivers);