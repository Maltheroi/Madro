-- Row Level Security.
-- Every table has RLS enabled. Tables without a policy for an operation deny
-- it to anon/authenticated; the service role bypasses RLS for server-side
-- jobs (catalog sync, account deletion).

do $$
declare
  t text;
begin
  foreach t in array array[
    'algorithm_versions', 'profiles', 'app_admins', 'nutrition_goals', 'weight_entries',
    'body_measurements', 'nutrition_sources', 'ingredients', 'nutrition_facts', 'recipes',
    'recipe_ingredients', 'recipe_favorites', 'meal_plans', 'planned_meals',
    'food_diary_entries', 'food_diary_days', 'retailers', 'stores', 'products',
    'ingredient_product_matches', 'data_sync_jobs', 'price_observations',
    'promotional_offers', 'pantry_items', 'shopping_baskets', 'shopping_basket_items',
    'shopping_lists', 'shopping_list_items', 'calorie_recommendations', 'rate_limit_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Simple owner policies: the row's user_id must be the caller.
do $$
declare
  t text;
begin
  foreach t in array array[
    'nutrition_goals', 'weight_entries', 'body_measurements', 'recipe_favorites',
    'meal_plans', 'planned_meals', 'food_diary_entries', 'food_diary_days',
    'pantry_items', 'shopping_baskets', 'shopping_basket_items', 'shopping_lists',
    'shopping_list_items'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
  end loop;
end;
$$;

-- Child rows must also point at a parent owned by the same user.
create policy planned_meals_parent on public.planned_meals as restrictive for all to authenticated
  using (exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.user_id = (select auth.uid())));

create policy shopping_basket_items_parent on public.shopping_basket_items as restrictive for all to authenticated
  using (exists (select 1 from public.shopping_baskets b where b.id = basket_id and b.user_id = (select auth.uid())))
  with check (exists (select 1 from public.shopping_baskets b where b.id = basket_id and b.user_id = (select auth.uid())));

create policy shopping_list_items_parent on public.shopping_list_items as restrictive for all to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));

-- Recommendations: users read theirs and may only change the status fields.
create policy calorie_recommendations_select on public.calorie_recommendations for select to authenticated
  using (user_id = (select auth.uid()));
create policy calorie_recommendations_insert on public.calorie_recommendations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy calorie_recommendations_update on public.calorie_recommendations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.calorie_recommendations from authenticated;
grant update (status, decided_at) on public.calorie_recommendations to authenticated;

-- Profiles: one row per user, created by trigger.
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Admin list: users can see whether they themselves are admins.
create policy app_admins_self on public.app_admins for select to authenticated using (user_id = (select auth.uid()));

-- Shared catalog: readable by signed-in users, written by the service role only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'algorithm_versions', 'nutrition_sources', 'ingredients', 'nutrition_facts',
    'retailers', 'stores', 'products', 'ingredient_product_matches', 'promotional_offers'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end;
$$;

-- Recipes: catalog recipes for everyone signed in; private recipes for their owner.
create policy recipes_select on public.recipes for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy recipes_insert on public.recipes for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy recipes_update on public.recipes for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy recipes_delete on public.recipes for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and (r.owner_id is null or r.owner_id = (select auth.uid()))));
create policy recipe_ingredients_write on public.recipe_ingredients for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())));

-- Prices: provider observations are public to signed-in users; manual prices are private.
create policy price_observations_select on public.price_observations for select to authenticated
  using (reported_by is null or reported_by = (select auth.uid()));
create policy price_observations_insert_manual on public.price_observations for insert to authenticated
  with check (reported_by = (select auth.uid()) and price_type = 'manual');
create policy price_observations_delete_manual on public.price_observations for delete to authenticated
  using (reported_by = (select auth.uid()));

-- Sync jobs are visible to admins only.
create policy data_sync_jobs_admin on public.data_sync_jobs for select to authenticated using (public.is_admin());

-- rate_limit_events: no policies; only consume_rate_limit (security definer) touches it.
revoke all on public.rate_limit_events from anon, authenticated;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

-- anon has no business with application tables.
revoke all on all tables in schema public from anon;

-- Private storage bucket for progress photos (skipped where Supabase Storage is absent).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('progress-photos', 'progress-photos', false)
      on conflict (id) do nothing;
    execute $p$
      create policy progress_photos_owner on storage.objects for all to authenticated
        using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
        with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
  end if;
end;
$$;
