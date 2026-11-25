CREATE OR REPLACE FUNCTION martins_private.validate_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare adm boolean:=martins_private.is_admin(); own text:=martins_private.driver_id();
 oldd jsonb; k text; rate numeric; paid numeric; amount numeric; v jsonb; path text; allowed text[]; driver text; vehicle text;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta para salvar.'; end if;
 perform pg_advisory_xact_lock(726461);
 if tg_op='DELETE' then
  if not adm then raise exception 'Somente administrador pode excluir.'; end if;
  if old.kind='veiculos' and exists(select 1 from public.frota_records r where r.data->>'veiculo_id'=old.id and r.kind<>old.kind) then raise exception 'Há registros vinculados ao veículo.'; end if;
  if old.kind='motoristas' and (exists(select 1 from public.frota_records r where r.data->>'motorista_id'=old.id) or exists(select 1 from public.frota_profiles p where p.motorista_id=old.id)) then raise exception 'Há registros ou login vinculados ao motorista.'; end if;
  return old;
 end if;
 if new.id='' or length(new.id)>100 then raise exception 'Identificador inválido.'; end if;
 if tg_op='UPDATE' and (new.id<>old.id or new.kind<>old.kind) then raise exception 'Identificador não pode mudar.'; end if;
 oldd:=case when tg_op='UPDATE' then old.data else '{}'::jsonb end;
 if new.kind='viagens' then
  new.data:=new.data-'diaria_veiculo_snapshot';
  if oldd ? 'diaria_veiculo_snapshot' then
   new.data:=jsonb_set(new.data,'{diaria_veiculo_snapshot}',oldd->'diaria_veiculo_snapshot');
  end if;
 end if;
 if new.data ? 'arquivo' or new.data ? 'cnh_arquivo' then raise exception 'Envie anexos pelo armazenamento privado.'; end if;
 if not adm and not (tg_op='UPDATE' and new.kind='veiculos' and pg_trigger_depth()>1 and (new.data-array['km','alterado_em'])=(old.data-array['km','alterado_em'])) then
  if own is null or new.kind<>'viagens' or new.data->>'motorista_id' is distinct from own then raise exception 'Acesso restrito ao próprio motorista.'; end if;
  allowed:=array['id','motorista_id','veiculo_id','data','hora','origem','destino','km_inicial','km_final','km','km_rodados','valor','observacoes','observacoes_finais','data_fim','hora_fim','status','tipo_uso','meta_valor_km','tarifa_particular','pagamento_status','arquivo_path','arquivo_nome','comprovante_status','comprovante_por','comprovante_conferido_em','criado_em','alterado_em','condutor_eventual','modalidade_diaria','diaria_veiculo_snapshot'];
  if exists(select 1 from jsonb_object_keys(new.data) as keys(key) where not key=any(allowed)) then raise exception 'Campo não permitido ao motorista.'; end if;
  if tg_op='INSERT' and new.data->>'status' is distinct from 'Em andamento' then raise exception 'Inicie a viagem antes de concluir.'; end if;
  if tg_op='UPDATE' then
   if oldd->>'motorista_id' is distinct from own then raise exception 'Viagem de outro motorista.'; end if;
   if oldd->>'status'='Concluída' and (new.data-array['arquivo_path','arquivo_nome','comprovante_status','comprovante_por','alterado_em','pagamento_status']) is distinct from (oldd-array['arquivo_path','arquivo_nome','comprovante_status','comprovante_por','alterado_em','pagamento_status']) then raise exception 'Viagem concluída só pode receber novo comprovante. Solicite correção ao administrador.'; end if;
   if oldd->>'status'='Em andamento' and (new.data-array['km_final','km','km_rodados','valor','observacoes','observacoes_finais','data_fim','hora_fim','status','arquivo_path','arquivo_nome','comprovante_status','comprovante_por','alterado_em','pagamento_status','meta_valor_km','tarifa_particular','modalidade_diaria']) is distinct from (oldd-array['km_final','km','km_rodados','valor','observacoes','observacoes_finais','data_fim','hora_fim','status','arquivo_path','arquivo_nome','comprovante_status','comprovante_por','alterado_em','pagamento_status','meta_valor_km','tarifa_particular','modalidade_diaria']) then raise exception 'Dados iniciais da viagem não podem mudar ao concluir.'; end if;
  end if;
  if new.data->>'arquivo_path' is distinct from oldd->>'arquivo_path' then
   new.data:=new.data||jsonb_build_object('comprovante_status','Pendente','comprovante_por','Motorista');
  elsif (new.data->>'comprovante_status') is distinct from (oldd->>'comprovante_status') then raise exception 'A conferência do comprovante é do administrador.';
  end if;
 end if;
 for k in select jsonb_object_keys(new.data) loop
  if k in ('valor','km','km_inicial','km_final','km_base','intervalo_km','intervalo_dias','valor_km','meta_valor_km') and coalesce(new.data->>k,'')<>'' then
   if (new.data->>k)!~'^\d+(\.\d+)?$' then raise exception 'Valor numérico inválido: %',k; end if;
  end if;
 end loop;
 if new.kind='viagens' then
  if new.data->>'tipo_uso'='Viagem de trabalho' then
    if tg_op='INSERT' and coalesce(new.data->>'modalidade_diaria','')='' then new.data:=new.data||jsonb_build_object('modalidade_diaria','inteira'); end if;
    if coalesce(new.data->>'modalidade_diaria','inteira') not in ('inteira','meia','combinada') then raise exception 'Modalidade da diária inválida.'; end if;
    if not adm and new.data->>'modalidade_diaria'='combinada' then new.data:=new.data||jsonb_build_object('valor',0); end if;
  elsif new.data ? 'modalidade_diaria' then raise exception 'Modalidade da diária permitida somente em viagem de trabalho.';
  end if;
  driver:=new.data->>'motorista_id'; vehicle:=new.data->>'veiculo_id';
  if not exists(select 1 from public.frota_records where kind='veiculos' and id=vehicle) then raise exception 'Veículo não cadastrado.'; end if;
  if coalesce(btrim(new.data->>'condutor_eventual'),'')<>'' then
    if not adm then raise exception 'Somente o administrador pode registrar condutor eventual.'; end if;
    if coalesce(driver,'')<>'' then raise exception 'Condutor eventual não deve estar vinculado a motorista cadastrado.'; end if;
    if length(btrim(new.data->>'condutor_eventual')) not between 2 and 100 then raise exception 'Nome do condutor eventual inválido.'; end if;
  elsif not exists(select 1 from public.frota_records where kind='motoristas' and id=driver) then raise exception 'Motorista não cadastrado.'; end if;
  if new.data->>'status' not in ('Em andamento','Concluída') or new.data->>'tipo_uso' not in ('Viagem de trabalho','Corrida particular para cliente','Uso particular do motorista','Manutenção','Deslocamento sem receita','Uso particular sem receita','Lazer do motorista') then raise exception 'Situação ou tipo de uso inválido.'; end if;
  if coalesce(new.data->>'data','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(new.data->>'hora','')!~'^\d{2}:\d{2}(:\d{2})?$' or coalesce(new.data->>'km_inicial','')='' then raise exception 'Informe data, hora e KM inicial.'; end if;
  if new.data->>'status'='Em andamento' then
   if exists(select 1 from public.frota_records r where r.kind='viagens' and r.id<>new.id and r.data->>'status'='Em andamento' and (r.data->>'veiculo_id'=vehicle or (coalesce(driver,'')<>'' and r.data->>'motorista_id'=driver))) then raise exception 'Motorista ou veículo já tem viagem em andamento.'; end if;
  end if;
  if new.data->>'tipo_uso'='Uso particular do motorista' and coalesce(new.data->>'condutor_eventual','')='' then
   if tg_op='UPDATE' and coalesce(oldd->>'meta_valor_km','')<>'' then rate:=(oldd->>'meta_valor_km')::numeric;
   else select (r.data->>'valor_km')::numeric into rate from public.frota_records r where r.kind='metas_km' and r.data->>'motorista_id'=driver and r.data->>'tipo_uso'='Uso particular do motorista' limit 1; end if;
   if coalesce(rate,0)<=0 then raise exception 'Cadastre a meta de uso particular para o motorista.'; end if;
   new.data:=new.data||jsonb_build_object('meta_valor_km',rate);
  elsif new.data->>'tipo_uso'='Viagem de trabalho' and tg_op='INSERT' then
   select (r.data->>'valor_km')::numeric into rate from public.frota_records r where r.kind='metas_km' and r.data->>'motorista_id'=driver and r.data->>'tipo_uso'='Viagem de trabalho' limit 1;
   new.data:=new.data||jsonb_build_object('meta_valor_km',coalesce(rate::text,''));
  end if;
  if not adm and new.data->>'tipo_uso'='Corrida particular para cliente' and (tg_op='INSERT' or oldd->>'status' is distinct from 'Concluída') then new.data:=new.data||jsonb_build_object('valor',0); end if;
  if new.data->>'tipo_uso'='Lazer do motorista' then
   new.data:=new.data-array['meta_valor_km','tarifa_particular'];
   if not adm then new.data:=new.data||jsonb_build_object('valor',case when tg_op='UPDATE' then coalesce(nullif(oldd->>'valor','')::numeric,0) else 0 end); end if;
  end if;
  if new.data->>'status'='Concluída' then
   if (tg_op='INSERT' or oldd->>'status' is distinct from 'Concluída') and exists(select 1 from public.frota_records c where c.kind='config' and c.id='empresa' and c.data->>'exigir'='true') and coalesce(new.data->>'arquivo_path','')='' then raise exception 'Anexe um comprovante para concluir.'; end if;
   if coalesce(new.data->>'km_final','')='' or (new.data->>'km_final')::numeric<(new.data->>'km_inicial')::numeric then raise exception 'KM final inválido.'; end if;
   amount:=(new.data->>'km_final')::numeric-(new.data->>'km_inicial')::numeric;
   new.data:=new.data||jsonb_build_object('km',amount,'km_rodados',amount);
   if new.data->>'tipo_uso'='Uso particular do motorista' and coalesce(new.data->>'condutor_eventual','')='' then new.data:=new.data||jsonb_build_object('valor',round(amount*rate,2)); end if;
   if new.data->>'tipo_uso' in ('Manutenção','Deslocamento sem receita','Uso particular sem receita') then new.data:=new.data||jsonb_build_object('valor',0); end if;
   if coalesce(new.data->>'valor','')='' then raise exception 'Informe o valor da viagem.'; end if;
  end if;
  select coalesce(sum((r.data->>'valor')::numeric),0) into paid from public.frota_records r where r.kind='pagamentos' and r.data->>'viagem_id'=new.id;
  if paid>coalesce((nullif(new.data->>'valor',''))::numeric,0) then raise exception 'Viagem não pode valer menos que o recebido.'; end if;
  new.data:=new.data||jsonb_build_object('pagamento_status',case when new.data->>'status'<>'Concluída' then 'Em andamento' when new.data->>'tipo_uso' in ('Manutenção','Deslocamento sem receita','Uso particular sem receita') then 'Sem cobrança' when new.data->>'tipo_uso'='Lazer do motorista' and coalesce(nullif(new.data->>'valor','')::numeric,0)=0 then 'Sem cobrança' when paid>=coalesce((nullif(new.data->>'valor',''))::numeric,0) then 'Paga' when paid>0 then 'Pagamento parcial' else 'Aguardando pagamento' end);
 end if;
 if new.kind in ('pagamentos','baixas') then
  if not adm then raise exception 'Somente administrador confirma recebimentos.'; end if;
  select r.data into v from public.frota_records r where r.kind=case when new.kind='pagamentos' then 'viagens' else 'pendencias' end and r.id=new.data->>case when new.kind='pagamentos' then 'viagem_id' else 'pendencia_id' end;
  if v is null then raise exception 'Registro de origem não encontrado.'; end if;
  if new.kind='pagamentos' and v->>'status'<>'Concluída' then raise exception 'Conclua a viagem antes do pagamento.'; end if;
  amount:=coalesce((new.data->>'valor')::numeric,0);
  select coalesce(sum((r.data->>'valor')::numeric),0) into paid from public.frota_records r where r.kind=new.kind and r.id<>new.id and r.data->>case when new.kind='pagamentos' then 'viagem_id' else 'pendencia_id' end=new.data->>case when new.kind='pagamentos' then 'viagem_id' else 'pendencia_id' end;
  if amount<=0 or amount+paid>(v->>'valor')::numeric+0.001 then raise exception 'Pagamento inválido ou maior que o saldo.'; end if;
 end if;
 if new.kind='metas_km' then
  if new.data->>'tipo_uso' not in ('Viagem de trabalho','Uso particular do motorista') or coalesce((new.data->>'valor_km')::numeric,0)<=0 then raise exception 'Meta inválida.'; end if;
  if exists(select 1 from public.frota_records r where r.kind='metas_km' and r.id<>new.id and r.data->>'motorista_id'=new.data->>'motorista_id' and r.data->>'tipo_uso'=new.data->>'tipo_uso') then raise exception 'Já existe meta para motorista e tipo de uso.'; end if;
 end if;
 for k in select unnest(array['arquivo_path','cnh_arquivo_path']) loop
  path:=new.data->>k;
  if path is not null and path<>'' and path is distinct from oldd->>k then
   if not exists(select 1 from storage.objects o where o.bucket_id='frota-documentos' and o.name=path and (adm or o.owner_id=auth.uid()::text)) then raise exception 'Anexo privado inválido.'; end if;
  end if;
 end loop;
 if tg_op='INSERT' then new.version:=1;new.created_at:=now();new.data:=new.data||jsonb_build_object('criado_em',now());
 else new.version:=old.version+1;new.created_at:=old.created_at;new.data:=jsonb_set(new.data,'{criado_em}',coalesce(oldd->'criado_em',to_jsonb(old.created_at))); end if;
 new.updated_at:=now();new.data:=new.data||jsonb_build_object('id',new.id,'alterado_em',now());
 return new;
end $function$;

create or replace function martins_private.set_vehicle_trip_daily()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
 configured jsonb;
 prior jsonb := '{}'::jsonb;
begin
 if tg_op = 'UPDATE' then prior := old.data; end if;
 if new.kind = 'veiculos' then
  if coalesce(new.data->>'diaria_trabalho','') <> '' and
     (new.data->>'diaria_trabalho' !~ '^[0-9]+(\.[0-9]{1,2})?$' or (new.data->>'diaria_trabalho')::numeric <= 0) then
   raise exception 'Informe uma diária por veículo maior que zero, com até dois decimais.';
  end if;
  return new;
 end if;
 new.data := new.data - 'diaria_veiculo_snapshot';
 if new.data->>'tipo_uso' is distinct from 'Viagem de trabalho' then return new; end if;
 if prior->>'veiculo_id' = new.data->>'veiculo_id' and prior->>'tipo_uso' = new.data->>'tipo_uso' then
  if prior ? 'diaria_veiculo_snapshot' then
   new.data := jsonb_set(new.data, '{diaria_veiculo_snapshot}', prior->'diaria_veiculo_snapshot');
  end if;
  return new;
 end if;
 select data->'diaria_trabalho' into configured from public.frota_records
 where kind='veiculos' and id=new.data->>'veiculo_id' and coalesce(data->>'diaria_trabalho','') <> '';
 if configured is not null then
  new.data := jsonb_set(new.data, '{diaria_veiculo_snapshot}', configured);
 end if;
 return new;
end $$;

revoke all on function martins_private.set_vehicle_trip_daily() from public, anon, authenticated;
create trigger zz_set_vehicle_trip_daily before insert or update on public.frota_records
for each row when (new.kind in ('viagens','veiculos')) execute function martins_private.set_vehicle_trip_daily();
