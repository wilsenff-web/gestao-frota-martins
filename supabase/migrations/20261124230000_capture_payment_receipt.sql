-- Save the original data of each digital receipt in its payment record.
create or replace function martins_private.capture_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior jsonb := '{}'::jsonb;
  source jsonb;
  company text;
  driver_name text;
  reference text;
begin
  if new.kind not in ('pagamentos', 'baixas') then return new; end if;
  if not martins_private.is_admin() then
    raise exception 'Somente administrador confirma recebimentos.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(726461);
  if tg_op = 'UPDATE' then prior := old.data; end if;

  if prior ? 'recibo' then
    if new.data->>'viagem_id' is distinct from prior->>'viagem_id'
       or new.data->>'pendencia_id' is distinct from prior->>'pendencia_id' then
      raise exception 'A origem de um pagamento com recibo emitido não pode mudar.';
    end if;
    if nullif(prior->>'arquivo_path', '') is not null
       and new.data->>'arquivo_path' is distinct from prior->>'arquivo_path' then
      raise exception 'O comprovante original do recibo deve ser preservado.';
    end if;
    new.data := jsonb_set(new.data, '{recibo}', prior->'recibo');
  else
    new.data := new.data - 'recibo';
    if new.data->>'forma' = 'Dinheiro' or new.data->>'recibo_digital' = 'true' then
      select data into source from public.frota_records where
        (new.kind = 'pagamentos' and kind = 'viagens' and id = new.data->>'viagem_id')
        or (new.kind = 'baixas' and kind = 'pendencias' and id = new.data->>'pendencia_id');
      if source is null then raise exception 'Origem do recibo não encontrada.'; end if;
      select data->>'empresa' into company from public.frota_records where kind='config' and id='empresa';
      select data->>'nome' into driver_name from public.frota_records where kind='motoristas' and id=source->>'motorista_id';
      new.data := jsonb_set(new.data, '{recibo}', jsonb_build_object(
        'numero', 'GFM-' || upper(new.id), 'emitido_em', now(),
        'empresa', coalesce(nullif(company,''),'Gestão de Frota Martins'),
        'motorista', coalesce(driver_name, source->>'condutor_eventual'),
        'origem_id', coalesce(new.data->>'viagem_id',new.data->>'pendencia_id'),
        'descricao', case when new.kind='pagamentos' then concat_ws(' → ',source->>'origem',source->>'destino') else source->>'descricao' end,
        'data_origem', source->>'data', 'valor_total', source->>'valor', 'valor', new.data->>'valor',
        'data', new.data->>'data', 'forma', new.data->>'forma', 'referencia', new.data->>'referencia_pagamento'));
    end if;
  end if;
  new.data := new.data - 'recibo_digital';

  if prior ? 'comprovante_sha256' then
    new.data := jsonb_set(new.data, '{comprovante_sha256}', prior->'comprovante_sha256');
  end if;
  if coalesce(new.data->>'comprovante_sha256','') <> ''
     and (new.data->>'comprovante_sha256') !~ '^[0-9a-f]{64}$' then
    raise exception 'Identificação do comprovante inválida.';
  end if;
  if exists(select 1 from public.frota_records r
            where r.kind in ('pagamentos','baixas')
              and (r.kind,r.id) <> (new.kind,new.id)
              and r.data->>'comprovante_sha256' = nullif(new.data->>'comprovante_sha256','')) then
    raise exception 'Este comprovante já foi usado em outro pagamento.';
  end if;

  reference := upper(btrim(new.data->>'referencia_pagamento'));
  if reference ~ '^E[A-Z0-9]{31}$' then
    if exists(select 1 from public.frota_records r
              where r.kind in ('pagamentos','baixas')
                and (r.kind,r.id) <> (new.kind,new.id)
                and upper(btrim(r.data->>'referencia_pagamento')) = reference) then
      raise exception 'Este identificador Pix já foi usado em outro pagamento.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function martins_private.capture_payment_receipt() from public, anon, authenticated;

create trigger zz_capture_payment_receipt
before insert or update on public.frota_records
for each row when (new.kind in ('pagamentos','baixas'))
execute function martins_private.capture_payment_receipt();

-- Unique indexes also cover concurrent direct table requests.
create unique index frota_receipt_proof_sha256 on public.frota_records ((data->>'comprovante_sha256'))
where kind in ('pagamentos','baixas') and coalesce(data->>'comprovante_sha256','') <> '';

create unique index frota_receipt_pix_e2e on public.frota_records ((upper(btrim(data->>'referencia_pagamento'))))
where kind in ('pagamentos','baixas') and upper(btrim(data->>'referencia_pagamento')) ~ '^E[A-Z0-9]{31}$';
