"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Minus, Plus, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { PriceStatusBadge } from "@/components/data-badges";
import type { ShoppingListItemView } from "@/server/services/shopping";
import { addManualItemAction, setPurchasedPriceAction, updateListItemAction } from "./actions";

const kr = (ore: number) =>
  `${(ore / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;

function ItemRow({ item }: { item: ShoppingListItemView }) {
  const [optimistic, setOptimistic] = useOptimistic(
    item,
    (s, patch: Partial<ShoppingListItemView>) => ({ ...s, ...patch }),
  );
  const [, startTransition] = useTransition();
  const [priceError, setPriceError] = useState<string | null>(null);
  const run = (
    patch: Partial<ShoppingListItemView>,
    update: Parameters<typeof updateListItemAction>[1],
  ) =>
    startTransition(async () => {
      setOptimistic(patch);
      await updateListItemAction(item.id, update);
    });

  if (optimistic.removed) {
    return (
      <li className="text-muted-foreground flex items-center justify-between gap-2 py-2 text-sm">
        <span className="line-through">{optimistic.label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => run({ removed: false }, { kind: "removed", value: false })}
        >
          <Undo2 aria-hidden /> Fortryd
        </Button>
      </li>
    );
  }
  const lineOre =
    optimistic.unitPriceOre !== null ? optimistic.unitPriceOre * optimistic.packages : null;
  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`${optimistic.label} lagt i kurven`}
          className="accent-primary mt-1 size-5 shrink-0"
          checked={optimistic.checked}
          onChange={(e) =>
            run({ checked: e.target.checked }, { kind: "checked", value: e.target.checked })
          }
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-medium ${optimistic.checked ? "text-muted-foreground line-through" : ""}`}
          >
            {optimistic.label}
          </p>
          <p className="text-muted-foreground text-xs">
            {optimistic.requiredQuantityText}
            {optimistic.packageText ? ` · pakning ${optimistic.packageText}` : ""}
            {!optimistic.required ? " · valgfri" : ""}
            {optimistic.unmatched ? " · ikke fundet i butikken" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">{lineOre !== null ? kr(lineOre) : "–"}</p>
          {optimistic.unitPriceOre !== null ? (
            <PriceStatusBadge status={optimistic.priceStatus} />
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        <div
          className="flex items-center rounded-md border"
          role="group"
          aria-label={`Antal ${optimistic.label}`}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label="Færre"
            disabled={optimistic.packages <= 0}
            onClick={() =>
              run(
                { packages: optimistic.packages - 1 },
                { kind: "packages", value: optimistic.packages - 1 },
              )
            }
          >
            <Minus aria-hidden />
          </Button>
          <span className="w-8 text-center text-sm" aria-live="polite">
            {optimistic.packages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Flere"
            disabled={optimistic.packages >= 99}
            onClick={() =>
              run(
                { packages: optimistic.packages + 1 },
                { kind: "packages", value: optimistic.packages + 1 },
              )
            }
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get("paid") ?? "");
            startTransition(async () => {
              const r = await setPurchasedPriceAction(item.id, value);
              setPriceError(r.ok ? null : r.error);
            });
          }}
        >
          <label className="sr-only" htmlFor={`paid-${item.id}`}>
            Betalt pris for {optimistic.label}
          </label>
          <Input
            id={`paid-${item.id}`}
            name="paid"
            inputMode="decimal"
            placeholder="Betalt kr."
            className="h-9 w-28"
            defaultValue={
              optimistic.purchasedPriceOre !== null
                ? (optimistic.purchasedPriceOre / 100).toFixed(2).replace(".", ",")
                : ""
            }
          />
          <Button type="submit" variant="outline" size="sm">
            Gem
          </Button>
        </form>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => run({ removed: true }, { kind: "removed", value: true })}
        >
          <X aria-hidden /> Fjern
        </Button>
      </div>
      {priceError ? <p className="text-destructive pl-8 text-sm">{priceError}</p> : null}
    </li>
  );
}

export function ShoppingListItems({ items }: { items: ShoppingListItemView[] }) {
  const categories = [...new Set(items.map((i) => i.category))];
  return (
    <div className="grid gap-4">
      {categories.map((c) => (
        <section key={c} aria-labelledby={`cat-${c}`}>
          <h3 id={`cat-${c}`} className="text-muted-foreground text-sm font-semibold capitalize">
            {c}
          </h3>
          <ul className="divide-y">
            {items
              .filter((i) => i.category === c)
              .map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function AddManualItemForm({ listId }: { listId: string }) {
  const [state, action] = useActionState(addManualItemAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
      <input type="hidden" name="listId" value={listId} />
      <FormField
        id="label"
        label="Egen vare"
        error={state && !state.ok ? state.fieldErrors?.label?.[0] : undefined}
      >
        <Input name="label" placeholder="f.eks. opvaskemiddel" />
      </FormField>
      <FormField
        id="price"
        label="Forventet pris"
        optional
        error={state && !state.ok ? state.fieldErrors?.price?.[0] : undefined}
      >
        <Input name="price" inputMode="decimal" placeholder="kr." />
      </FormField>
      <SubmitButton variant="outline">Tilføj</SubmitButton>
    </form>
  );
}
