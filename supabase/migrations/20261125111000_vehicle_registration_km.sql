create or replace function martins_private.capture_vehicle_registration_km()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reading text;
begin
 if tg_op = 'INSERT' then
  reading := nullif(new.data->>'km','');
 elsif nullif(old.data->>'km_cadastro','') is not null then
  new.data := jsonb_set(new.data,'{km_cadastro}',old.data->'km_cadastro');
  return new;
 else
  reading := nullif(new.data->>'km_cadastro','');
 end if;
 new.data := new.data - 'km_cadastro';
 if reading is not null then
  if reading !~ '^[0-9]+(\.[0-9]+)?$' then
   raise exception 'Informe um KM inicial do cadastro válido.';
  end if;
  new.data := jsonb_set(new.data,'{km_cadastro}',to_jsonb(reading::numeric));
 end if;
 return new;
end $$;

revoke all on function martins_private.capture_vehicle_registration_km() from public, anon, authenticated;
create trigger zy_capture_vehicle_registration_km before insert or update on public.frota_records
for each row when (new.kind = 'veiculos') execute function martins_private.capture_vehicle_registration_km();
