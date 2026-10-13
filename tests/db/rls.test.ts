import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pruneOffers, upsertOffers } from "../../src/server/providers/offers-store";
import type { OfferRecord } from "../../src/server/providers/shelfatlas";

const url = process.env.DATABASE_TEST_URL;
if (!url) throw new Error("DATABASE_TEST_URL is not set; run via `npm run test:db`.");
const sql = postgres(url, { max: 1, onnotice: () => {} });

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

/** Run `fn` inside a transaction as an authenticated user, then roll back. */
async function asUser<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let result: T;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      result = await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  return result!;
}
class Rollback extends Error {}

beforeAll(async () => {
  await sql`insert into auth.users (id, email) values (${alice}, 'alice@example.test'), (${bob}, 'bob@example.test') on conflict do nothing`;
  await sql`insert into public.weight_entries (user_id, measured_at, weight_kg) values (${bob}, now(), 82.4)`;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${alice}, ${bob})`;
  await sql.end();
});

describe("schema", () => {
  it("creates a profile for every new auth user", async () => {
    const rows = await sql`select id from public.profiles where id in (${alice}, ${bob})`;
    expect(rows).toHaveLength(2);
  });

  it("has RLS enabled on every public table", async () => {
    const rows = await sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("seeds a usable development catalog", async () => {
    const [{ count: recipes }] = await sql`select count(*)::int as count from public.recipes`;
    const [{ count: facts }] = await sql`select count(*)::int as count from public.nutrition_facts`;
    const [{ count: prices }] =
      await sql`select count(*)::int as count from public.price_observations where is_synthetic`;
    const [{ count: real }] =
      await sql`select count(*)::int as count from public.price_observations where not is_synthetic`;
    expect(recipes).toBeGreaterThanOrEqual(15);
    expect(facts).toBeGreaterThanOrEqual(40);
    expect(prices).toBeGreaterThan(100);
    expect(real).toBe(0);
  });

  it("seeds Frida 5.5 values as a verified source", async () => {
    const [src] =
      await sql`select license, verification_status from public.nutrition_sources where key = 'frida'`;
    expect(src).toEqual({ license: "CC BY 4.0", verification_status: "verified" });
    const [{ n }] = await sql`
      select count(*)::int as n from public.nutrition_facts f join public.nutrition_sources s on s.id = f.source_id
      where s.key = 'frida' and f.confidence = 'high' and f.source_food_code is not null`;
    expect(n).toBeGreaterThanOrEqual(70);
  });

  it("tags recipes with known cuisines only", async () => {
    const rows = await sql`
      select c, count(*)::int as n from public.recipes, unnest(cuisines) c group by c order by c`;
    for (const r of rows) expect(r.n).toBeGreaterThanOrEqual(8);
    expect(rows.map((r) => r.c)).toEqual([
      "asiatisk",
      "dansk",
      "fitness",
      "italiensk",
      "mexicansk",
      "thai",
    ]);
    await expect(
      sql`update public.recipes set cuisines = '{fransk}' where slug = 'pasta-bolognese'`,
    ).rejects.toThrow();
  });

  it("keeps price observations append-only", async () => {
    await expect(
      sql`update public.price_observations set price_ore = 1 where true`,
    ).rejects.toThrow(/append-only/);
  });

  it("enforces value constraints", async () => {
    await expect(
      sql`insert into public.weight_entries (user_id, measured_at, weight_kg) values (${alice}, now(), 10)`,
    ).rejects.toThrow();
    await expect(
      sql`insert into public.price_observations (product_id, retailer_id, price_ore, price_type, observed_at, source_key, confidence)
          select id, retailer_id, 1000, 'manual', now(), 'x', 'low' from public.products limit 1`,
    ).rejects.toThrow(); // manual price needs reported_by
  });
});

describe("row level security", () => {
  it("users only see their own rows", async () => {
    const rows = await asUser(alice, (tx) => tx`select * from public.weight_entries`);
    expect(rows).toHaveLength(0);
    const bobs = await asUser(bob, (tx) => tx`select * from public.weight_entries`);
    expect(bobs).toHaveLength(1);
  });

  it("users cannot insert rows for someone else", async () => {
    await expect(
      asUser(
        alice,
        (tx) =>
          tx`insert into public.weight_entries (user_id, measured_at, weight_kg) values (${bob}, now(), 70)`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("users can insert and read their own rows", async () => {
    const rows = await asUser(alice, async (tx) => {
      await tx`insert into public.weight_entries (user_id, measured_at, weight_kg) values (${alice}, now(), 70.2)`;
      return tx`select weight_kg from public.weight_entries`;
    });
    expect(rows).toHaveLength(1);
  });

  it("profiles are private and admin status cannot be self-granted", async () => {
    const rows = await asUser(alice, (tx) => tx`select id from public.profiles`);
    expect(rows.map((r) => r.id)).toEqual([alice]);
    await expect(
      asUser(alice, (tx) => tx`insert into public.app_admins (user_id) values (${alice})`),
    ).rejects.toThrow();
    const isAdmin = await asUser(alice, (tx) => tx`select public.is_admin() as a`);
    expect(isAdmin[0].a).toBe(false);
  });

  it("catalog is readable but not writable by users", async () => {
    const rows = await asUser(alice, (tx) => tx`select count(*)::int as c from public.ingredients`);
    expect(rows[0].c).toBeGreaterThan(0);
    await expect(
      asUser(
        alice,
        (tx) =>
          tx`insert into public.ingredients (slug, canonical_name, name_da, category) values ('x', 'x', 'x', 'x')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("manual prices are private to the reporter", async () => {
    const product = await sql`select id, retailer_id from public.products limit 1`;
    const [{ id: pid, retailer_id: rid }] = product;
    const seenByBob = await asUser(alice, async (tx) => {
      await tx`insert into public.price_observations (product_id, retailer_id, price_ore, price_type, observed_at, source_key, confidence, reported_by)
               values (${pid}, ${rid}, 1995, 'manual', now(), 'manual', 'low', ${alice})`;
      const own =
        await tx`select count(*)::int as c from public.price_observations where reported_by = ${alice}`;
      expect(own[0].c).toBe(1);
      // Same transaction, switch identity to bob.
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: bob })}, true)`;
      return tx`select count(*)::int as c from public.price_observations where reported_by = ${alice}`;
    });
    expect(seenByBob[0].c).toBe(0);
  });

  it("users cannot forge provider prices", async () => {
    const [{ id: pid, retailer_id: rid }] =
      await sql`select id, retailer_id from public.products limit 1`;
    await expect(
      asUser(
        alice,
        (
          tx,
        ) => tx`insert into public.price_observations (product_id, retailer_id, price_ore, price_type, observed_at, source_key, confidence)
                              values (${pid}, ${rid}, 100, 'shelf', now(), 'fake', 'high')`,
      ),
    ).rejects.toThrow();
  });

  it("child rows require an owned parent", async () => {
    await sql`insert into public.meal_plans (id, user_id, week_start, seed, targets) values ('33333333-3333-4333-8333-333333333333', ${bob}, '2026-10-12', 1, '{}')`;
    const [{ id: recipeId }] = await sql`select id from public.recipes limit 1`;
    await expect(
      asUser(
        alice,
        (
          tx,
        ) => tx`insert into public.planned_meals (meal_plan_id, user_id, day_index, slot, recipe_id, servings, household_servings)
                              values ('33333333-3333-4333-8333-333333333333', ${alice}, 0, 'dinner', ${recipeId}, 1, 1)`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("recommendations: users may change status only", async () => {
    const [{ id: alg }] =
      await sql`select id from public.algorithm_versions where key = 'adaptive-energy'`;
    const [{ id }] =
      await sql`insert into public.calorie_recommendations (user_id, algorithm_version_id, decision, previous_target_kcal, recommended_target_kcal, quality, explanation)
                               values (${alice}, ${alg}, 'adjust', 2200, 2050, '{}', '{}') returning id`;
    await asUser(
      alice,
      (tx) =>
        tx`update public.calorie_recommendations set status = 'accepted', decided_at = now() where id = ${id}`,
    );
    await expect(
      asUser(
        alice,
        (tx) =>
          tx`update public.calorie_recommendations set recommended_target_kcal = 900 where id = ${id}`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("rate limiter allows up to the limit per window", async () => {
    const results = await asUser(alice, async (tx) => {
      const out: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        const [{ ok }] = await tx`select public.consume_rate_limit('test', 3, 60) as ok`;
        out.push(ok);
      }
      return out;
    });
    expect(results).toEqual([true, true, true, false]);
  });

  it("deleting the auth user cascades all personal data", async () => {
    const tmp = "44444444-4444-4444-8444-444444444444";
    await sql`insert into auth.users (id) values (${tmp})`;
    await sql`insert into public.weight_entries (user_id, measured_at, weight_kg) values (${tmp}, now(), 80)`;
    await sql`delete from auth.users where id = ${tmp}`;
    const rows = await sql`select 1 from public.weight_entries where user_id = ${tmp}`;
    const profiles = await sql`select 1 from public.profiles where id = ${tmp}`;
    expect(rows.length + profiles.length).toBe(0);
  });
});

describe("packaged products", () => {
  it("provider products are shared, user products are private", async () => {
    await sql`insert into public.packaged_products (source_key, code, gtin, name, data_quality, energy_kcal)
              values ('open-food-facts', '5700000000001', '5700000000001', 'Testmælk', 'partial', 46)`;
    const seen = await asUser(alice, async (tx) => {
      await tx`insert into public.packaged_products (source_key, code, name, data_quality, energy_kcal, created_by)
               values ('user', 'eget-1', 'Alices bolle', 'minimal', 300, ${alice})`;
      const own = await tx`select name from public.packaged_products order by name`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: bob })}, true)`;
      const bobs = await tx`select name from public.packaged_products order by name`;
      return { own: own.map((r) => r.name), bobs: bobs.map((r) => r.name) };
    });
    expect(seen.own).toEqual(["Alices bolle", "Testmælk"]);
    expect(seen.bobs).toEqual(["Testmælk"]);
    await sql`delete from public.packaged_products where code = '5700000000001'`;
  });

  it("users cannot write provider products or products for others", async () => {
    await expect(
      asUser(
        alice,
        (tx) =>
          tx`insert into public.packaged_products (source_key, code, name, data_quality) values ('open-food-facts', '1', 'Falsk', 'minimal')`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        alice,
        (tx) =>
          tx`insert into public.packaged_products (source_key, code, name, data_quality, created_by) values ('user', '1', 'Falsk', 'minimal', ${bob})`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("anon has no access", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`set local role anon`;
        return tx`select 1 from public.packaged_products limit 1`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("diary entries accept the product source", async () => {
    const [{ id }] =
      await sql`insert into public.packaged_products (source_key, code, name, data_quality, energy_kcal)
                               values ('open-food-facts', '5700000000002', 'Testyoghurt', 'complete', 60) returning id`;
    const rows = await asUser(alice, async (tx) => {
      await tx`insert into public.food_diary_entries (user_id, entry_date, slot, source, product_id, description, grams, energy_kcal)
               values (${alice}, '2026-10-13', 'breakfast', 'product', ${id}, 'Testyoghurt', 150, 90)`;
      return tx`select source, product_id from public.food_diary_entries where user_id = ${alice}`;
    });
    expect(rows).toEqual([{ source: "product", product_id: id }]);
    await sql`delete from public.packaged_products where id = ${id}`;
  });
});

describe("promotional offers (ShelfAtlas)", () => {
  const offer = (id: string, over: Partial<OfferRecord> = {}): OfferRecord => ({
    sourceKey: "shelfatlas",
    externalId: id,
    retailerSlug: "netto",
    retailerName: "Netto",
    title: `Testtilbud ${id}`,
    priceOre: 2995,
    regularPriceOre: 3995,
    packageQuantity: null,
    packageUnit: null,
    unitPriceOre: 5990,
    unitPriceUnit: "kg",
    validFrom: new Date(Date.now() - 86_400_000).toISOString(),
    validTo: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    ingestedAt: null,
    ...over,
  });

  afterAll(async () => {
    await sql`delete from public.promotional_offers where source_key = 'shelfatlas'`;
    await sql`delete from public.retailers where slug = 'testkaede'`;
  });

  it("upserts offers, adds unknown chains and prunes withdrawn and expired ones", async () => {
    const first = new Date(Date.now() - 60_000);
    await sql.begin((tx) =>
      upsertOffers(
        tx,
        [
          offer("a"),
          offer("b", { retailerSlug: "testkaede", retailerName: "Testkæde" }),
          offer("old", {
            validFrom: "2026-01-01T00:00:00Z",
            validTo: "2026-01-07T00:00:00Z",
          }),
        ],
        first,
        null,
      ),
    );
    const [chain] = await sql`select name from public.retailers where slug = 'testkaede'`;
    expect(chain.name).toBe("Testkæde");

    const second = new Date();
    await sql.begin(async (tx) => {
      await upsertOffers(tx, [offer("a", { priceOre: 2495 })], second, null);
      return pruneOffers(tx, "shelfatlas", { completeSyncStartedAt: second });
    });
    const rows = await sql`
      select external_id, price_ore from public.promotional_offers where source_key = 'shelfatlas'`;
    expect(rows).toEqual([{ external_id: "a", price_ore: 2495 }]);
  });

  it("is readable but not writable for signed-in users", async () => {
    await sql.begin((tx) => upsertOffers(tx, [offer("r")], new Date(), null));
    const rows = await asUser(
      alice,
      (tx) => tx`select title from public.promotional_offers where external_id = 'r'`,
    );
    expect(rows).toEqual([{ title: "Testtilbud r" }]);
    await expect(
      asUser(
        alice,
        (tx) => tx`update public.promotional_offers set price_ore = 1 where external_id = 'r'`,
      ),
    ).resolves.toHaveLength(0);
    await expect(
      asUser(
        alice,
        (
          tx,
        ) => tx`insert into public.promotional_offers (retailer_id, source_key, external_id, title, price_ore, valid_from, valid_to)
                   select id, 'shelfatlas', 'x', 'Falsk', 100, now(), now() from public.retailers limit 1`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
  });

  it("rejects a unit price without its unit", async () => {
    await expect(
      sql`insert into public.promotional_offers (retailer_id, source_key, external_id, title, price_ore, unit_price_ore, valid_from, valid_to)
          select id, 'shelfatlas', 'u', 'Uden enhed', 100, 200, now(), now() from public.retailers limit 1`,
    ).rejects.toThrow(/promotional_offers_unit_price_pair/);
  });
});
