"use client";

import {
  useActionState,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { Camera, ScanBarcode, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { MEAL_SLOT_LABELS_DA, MEAL_SLOTS } from "@/features/meal-planning/domain/planner";
import { ALLERGEN_LABEL } from "@/features/profile/constants";
import { formatAmount } from "@/lib/format";
import type { ActionResult } from "@/lib/validation/common";
import type { PackagedProduct } from "@/server/services/products";
import { createProductAction, lookupBarcodeAction, searchProductsAction } from "./actions";
import { portionNutrition } from "./domain/products";

const err = (s: ActionResult<unknown> | null, k: string) =>
  s && !s.ok ? s.fieldErrors?.[k]?.[0] : undefined;

const fmt = (v: number | null, unit = " g") =>
  v === null ? "ukendt" : `${formatAmount(v)}${unit}`;

const UNKNOWN_LABEL = { proteinG: "protein", carbohydrateG: "kulhydrat", fatG: "fedt" } as const;

export function ProductSourceBadge({ product }: { product: PackagedProduct }) {
  if (product.isOwn) return <Badge variant="info">Din egen vare</Badge>;
  return <Badge variant="warning">Ikke verificeret</Badge>;
}

/** "Vare" tab in the food diary: search, barcode lookup, own products. */
export function ProductPanel({
  date,
  action,
  state,
}: {
  date: string;
  action: (formData: FormData) => void;
  state: ActionResult | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PackagedProduct[] | null>(null);
  const [selected, setSelected] = useState<PackagedProduct | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ gtin: string } | null>(null);
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [searching, startSearch] = useTransition();
  const [looking, startLookup] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      startSearch(async () => setResults(await searchProductsAction(q)));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function lookup(code: string) {
    setNotice(null);
    startLookup(async () => {
      const r = await lookupBarcodeAction(code);
      if (r.status === "found") {
        setSelected(r.product);
        setCreating(null);
      } else if (r.status === "not_found") {
        setSelected(null);
        setNotice(
          r.checkedOnline
            ? "Varen findes ikke i Open Food Facts endnu. Du kan oprette den med tallene fra pakken."
            : "Varen findes ikke i vores varekatalog. Du kan oprette den med tallene fra pakken.",
        );
        setCreating({ gtin: code.replace(/\D/g, "") });
      } else {
        setNotice(r.error);
      }
    });
  }

  if (selected) {
    return (
      <LogProductForm
        product={selected}
        date={date}
        action={action}
        state={state}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (creating) {
    return (
      <CreateProductForm
        gtin={creating.gtin}
        notice={notice}
        onCreated={(p) => {
          setCreating(null);
          setNotice(null);
          setSelected(p);
        }}
        onCancel={() => {
          setCreating(null);
          setNotice(null);
        }}
      />
    );
  }

  return (
    <div role="tabpanel" className="grid gap-4">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (barcode.trim()) lookup(barcode);
        }}
      >
        <FormField
          id="barcode"
          label="Stregkode"
          hint="De 8 eller 13 cifre under stregerne. Danske varer starter med 57."
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" disabled={looking} aria-busy={looking}>
            <Search aria-hidden /> {looking ? "Slår op …" : "Slå op"}
          </Button>
          <ScanButton
            scanning={scanning}
            onToggle={setScanning}
            onDetected={(code) => {
              setScanning(false);
              setBarcode(code);
              lookup(code);
            }}
          />
        </div>
      </form>

      {notice ? (
        <p role="status" className="text-muted-foreground text-sm">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-2">
        <FormField
          id="productQuery"
          label="Søg efter vare"
          hint="Fx “skyr”, “rugbrød” eller et mærke."
        >
          <Input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setResults(null);
            }}
          />
        </FormField>
        {searching ? <p className="text-muted-foreground text-sm">Søger …</p> : null}
        {results && !searching && results.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ingen varer fundet.</p>
        ) : null}
        {results && results.length > 0 ? (
          <ul className="grid gap-2" aria-label="Søgeresultater">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  className="bg-card hover:bg-muted flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[
                        p.brand,
                        p.energyKcal !== null
                          ? `${Math.round(p.energyKcal)} kcal/100 g`
                          : "kalorier ukendt",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ProductSourceBadge product={p} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => setCreating({ gtin: barcode.replace(/\D/g, "") })}
      >
        Opret din egen vare
      </Button>
      <p className="text-muted-foreground text-xs">
        Varedata fra{" "}
        <a
          href="https://world.openfoodfacts.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Open Food Facts
        </a>{" "}
        (ODbL). Data er indtastet af frivillige og er ikke verificeret.
      </p>
    </div>
  );
}

const noopSubscribe = () => () => {};

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function ScanButton({
  scanning,
  onToggle,
  onDetected,
}: {
  scanning: boolean;
  onToggle: (on: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const detected = useEffectEvent((code: string) => onDetected(code));
  const failed = useEffectEvent(() => {
    setError("Kameraet kunne ikke startes. Tjek tilladelsen, eller indtast stregkoden.");
    onToggle(false);
  });

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const constraints: MediaStreamConstraints = {
      video: { facingMode: "environment" },
      audio: false,
    };
    (async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        if ("BarcodeDetector" in window) {
          // Chrome on Android: the browser's own detector.
          const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
          const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stopped) return;
          video.srcObject = stream;
          await video.play();
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) return detected(codes[0].rawValue);
            } catch {
              // Frame not ready yet; try again.
            }
            timer = setTimeout(tick, 250);
          };
          tick();
          return;
        }
        // Safari (iPhone) and others: a JavaScript decoder, loaded only when needed.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all(
          [import("@zxing/browser"), import("@zxing/library")],
        );
        if (stopped) return;
        const hints = new Map([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
          ],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints(constraints, video, (result) => {
          if (result && !stopped) {
            stopped = true;
            stopZxing?.();
            detected(result.getText());
          }
        });
        stopZxing = () => controls.stop();
        if (stopped) controls.stop();
      } catch {
        if (!stopped) failed();
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  if (!supported) {
    return (
      <p className="text-muted-foreground w-full text-xs">
        Din browser kan ikke scanne stregkoder med kameraet. Indtast tallene i stedet.
      </p>
    );
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setError(null);
          onToggle(!scanning);
        }}
      >
        {scanning ? <X aria-hidden /> : <Camera aria-hidden />}{" "}
        {scanning ? "Stop scanning" : "Scan med kamera"}
      </Button>
      {scanning ? (
        <div className="relative w-full overflow-hidden rounded-lg border bg-black">
          <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
          <ScanBarcode
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto size-16 text-white/70"
          />
          <p className="sr-only" role="status">
            Kameraet er tændt. Hold stregkoden foran kameraet.
          </p>
        </div>
      ) : null}
      {error ? <p className="text-destructive w-full text-sm">{error}</p> : null}
    </>
  );
}

function LogProductForm({
  product,
  date,
  action,
  state,
  onBack,
}: {
  product: PackagedProduct;
  date: string;
  action: (formData: FormData) => void;
  state: ActionResult | null;
  onBack: () => void;
}) {
  const [grams, setGrams] = useState("100");
  const g = Number(grams.replace(",", "."));
  const portion = portionNutrition(product, g);

  return (
    <div role="tabpanel" className="grid gap-3">
      <div className="bg-card grid gap-2 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium">{product.name}</h3>
            {product.brand ? (
              <p className="text-muted-foreground text-sm">{product.brand}</p>
            ) : null}
          </div>
          <ProductSourceBadge product={product} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">Kalorier/100 g</dt>
            <dd>{fmt(product.energyKcal, " kcal")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Protein</dt>
            <dd>{fmt(product.proteinG)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Kulhydrat</dt>
            <dd>{fmt(product.carbohydrateG)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Fedt</dt>
            <dd>{fmt(product.fatG)}</dd>
          </div>
        </dl>
        {product.allergens.length ? (
          <p className="text-sm">
            Allergener ifølge kilden:{" "}
            {product.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(", ")}
          </p>
        ) : null}
        {!product.isOwn ? (
          <p className="text-muted-foreground text-xs">
            Kilde:{" "}
            <a
              href={product.sourceUrl ?? "https://world.openfoodfacts.org/"}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Open Food Facts
            </a>{" "}
            (ODbL). Tjek tallene mod pakken.
          </p>
        ) : null}
      </div>

      {product.energyKcal === null ? (
        <Alert>
          <AlertDescription>
            Varen mangler kalorier, så den kan ikke registreres. Opret den som din egen vare med
            tallene fra pakken.
          </AlertDescription>
        </Alert>
      ) : (
        <form action={action} className="grid gap-3">
          <input type="hidden" name="kind" value="product" />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="productId" value={product.id} />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="productGrams"
              label="Gram"
              error={state && !state.ok ? state.fieldErrors?.grams?.[0] : undefined}
            >
              <Input
                name="grams"
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
            </FormField>
            <FormField id="productSlot" label="Måltid" optional>
              <NativeSelect name="slot" defaultValue="">
                <option value="">Ikke angivet</option>
                {MEAL_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {MEAL_SLOT_LABELS_DA[s]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {portion ? (
            <p className="text-sm" aria-live="polite">
              {Math.round(portion.energyKcal)} kcal · {formatAmount(portion.proteinG)} g protein
              {portion.unknown.length
                ? `. ${portion.unknown.map((k) => UNKNOWN_LABEL[k]).join(" og ")} er ukendt og tælles som 0.`
                : ""}
            </p>
          ) : null}
          <SubmitButton>Tilføj</SubmitButton>
        </form>
      )}
      <Button type="button" variant="ghost" onClick={onBack}>
        Vælg en anden vare
      </Button>
    </div>
  );
}

function CreateProductForm({
  gtin,
  notice,
  onCreated,
  onCancel,
}: {
  gtin: string;
  notice: string | null;
  onCreated: (p: PackagedProduct) => void;
  onCancel: () => void;
}) {
  const [state, action] = useActionState(createProductAction, null);
  const created = useEffectEvent((p: PackagedProduct) => onCreated(p));
  useEffect(() => {
    if (state?.ok && state.data) created(state.data);
  }, [state]);

  return (
    <form role="tabpanel" action={action} className="grid gap-3">
      <h3 className="font-medium">Opret din egen vare</h3>
      {notice ? <p className="text-muted-foreground text-sm">{notice}</p> : null}
      <p className="text-muted-foreground text-sm">
        Skriv tallene pr. 100 g fra næringsdeklarationen. Varen kan kun ses af dig.
      </p>
      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField id="p-name" label="Navn" error={err(state, "name")}>
        <Input name="name" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="p-brand" label="Mærke" optional error={err(state, "brand")}>
          <Input name="brand" />
        </FormField>
        <FormField id="p-gtin" label="Stregkode" optional error={err(state, "gtin")}>
          <Input name="gtin" inputMode="numeric" defaultValue={gtin} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormField id="p-energyKcal" label="Kalorier (kcal)" error={err(state, "energyKcal")}>
          <Input name="energyKcal" inputMode="decimal" />
        </FormField>
        <FormField id="p-proteinG" label="Protein (g)" optional error={err(state, "proteinG")}>
          <Input name="proteinG" inputMode="decimal" />
        </FormField>
        <FormField
          id="p-carbohydrateG"
          label="Kulhydrat (g)"
          optional
          error={err(state, "carbohydrateG")}
        >
          <Input name="carbohydrateG" inputMode="decimal" />
        </FormField>
        <FormField id="p-sugarsG" label="Heraf sukker (g)" optional error={err(state, "sugarsG")}>
          <Input name="sugarsG" inputMode="decimal" />
        </FormField>
        <FormField id="p-fatG" label="Fedt (g)" optional error={err(state, "fatG")}>
          <Input name="fatG" inputMode="decimal" />
        </FormField>
        <FormField id="p-saltG" label="Salt (g)" optional error={err(state, "saltG")}>
          <Input name="saltG" inputMode="decimal" />
        </FormField>
      </div>
      <SubmitButton>Gem vare</SubmitButton>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Annullér
      </Button>
    </form>
  );
}
