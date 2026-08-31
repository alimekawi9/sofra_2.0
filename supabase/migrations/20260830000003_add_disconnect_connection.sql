create or replace function public.disconnect_connection(
  p_connection_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  update public.connections
  set status = 'declined',
      responded_at = now(),
      updated_at = now()
  where id = p_connection_id
    and status = 'accepted'
    and p_user_id in (requester_id, recipient_id);

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.disconnect_connection(uuid, uuid) from public;
grant execute on function public.disconnect_connection(uuid, uuid) to anon, authenticated;
