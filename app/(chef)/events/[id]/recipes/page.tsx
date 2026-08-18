"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChefTabs from "@/components/ChefTabs";
import { createClient } from "@/lib/supabase/client";
import { buildIntel, type TasteProfile, type TableIntel } from "@/lib/intel";
import {
  deriveCourse,
  type Exclusion,
  type PantryItem,
  type Signature,
} from "@/lib/menu";
import { normalizeProteinPreferences } from "@/lib/protein-preferences";
import {
  recipeSafetyWarnings,
  scaleRecipeIngredients,
  type Recipe,
  type RecipeIngredient,
} from "@/lib/recipes";
import "@/components/sofra-v2/sofra-v2.css";
import { isEventManager } from "@/lib/event-access";

type StoredRecipe = Omit<Recipe, "ingredients"> & {
  recipe_ingredients: RecipeIngredient[];
};
type CourseRow = {
  id: string;
  slot: string;
  dish_name: string;
  dish_origin: string | null;
  source: string | null;
  component_ids: string[] | null;
  sort_order: number;
  recipes?: StoredRecipe | StoredRecipe[] | null;
};
type LoadedCourse = CourseRow & {
  recipe: Recipe | null;
  dishExclusions: Exclusion[];
};
type Draft = {
  baseServings: string;
  ingredientNames: string[];
  ingredients: RecipeIngredient[] | null;
  instructions: string;
};

const emptyDraft: Draft = {
  baseServings: "4",
  ingredientNames: [""],
  ingredients: null,
  instructions: "",
};
const amount = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);

function dishEaterCount(course: LoadedCourse, intel: TableIntel | null): number {
  const guestCount = intel?.guestCount ?? 0;
  const excludedGuests = new Set(course.dishExclusions.map((item) => item.guest)).size;
  return Math.max(1, guestCount - excludedGuests);
}

export default function RecipesPage({ params }: { params: { id: string } }) {
  const { id } = params,
    router = useRouter(),
    supabase = createClient();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [eventTitle, setEventTitle] = useState(""),
    [eventDate, setEventDate] = useState(""),
    [intel, setIntel] = useState<TableIntel | null>(null),
    [courses, setCourses] = useState<LoadedCourse[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [viewing, setViewing] = useState<string | null>(null),
    [draft, setDraft] = useState<Draft>(emptyDraft),
    [busy, setBusy] = useState<string | null>(null),
    [restrictedChef, setRestrictedChef] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const userId = localStorage.getItem("sofra_user_id");
      if (!userId) {
        router.push("/login");
        return;
      }
      const { data: event } = await supabase
        .from("events")
        .select("host_id,chef_id,title,event_date")
        .eq("id", id)
        .maybeSingle();
      const manager = event ? await isEventManager(supabase, id, userId, event.host_id) : false;
      if (!event || (event.chef_id !== userId && !manager)) {
        router.replace(`/events/${id}`);
        return;
      }
      setRestrictedChef(event.chef_id === userId && event.host_id !== userId && !manager);
      setEventTitle(event.title);
      setEventDate(event.event_date);
      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("user_id,users(name)")
        .eq("event_id", id)
        .in("status", ["going", "maybe"]);
      const ids = (rsvps ?? []).map((x) => x.user_id),
        { data: profiles } = ids.length
          ? await supabase
              .from("taste_profiles")
              .select(
                "user_id,dietary,avoid,protein_anchor,protein_preferences,flavor_preference,adventurousness",
              )
              .in("user_id", ids)
          : { data: [] };
      const guests: TasteProfile[] = (rsvps ?? []).map((row) => {
          const p = (profiles ?? []).find((x) => x.user_id === row.user_id),
            related = row.users as unknown as { name?: string } | null;
          return {
            name: related?.name ?? "Unknown",
            dietary: p?.dietary ?? [],
            avoid: p?.avoid ?? [],
            proteinAnchor: p?.protein_anchor ?? null,
            proteinPreferences: normalizeProteinPreferences(
              p?.protein_preferences,
              p?.protein_anchor,
            ),
            flavorPreference: p?.flavor_preference ?? [],
            adventurousness: p?.adventurousness ?? 50,
          };
        }),
        built = buildIntel(guests);
      setIntel(built);
      const chefId = event.chef_id ?? event.host_id,
        [recipeResponse, { data: signatures }, { data: pantry }] =
          await Promise.all([
            fetch(
              `/api/recipes?eventId=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`,
            ),
            supabase
              .from("signatures")
              .select(
                "id,name,tags,contains_allergens,slot,novelty_score,is_substantial",
              )
              .eq("chef_id", chefId),
            supabase
              .from("pantry_items")
              .select("id,name,tags,contains_allergens")
              .eq("chef_id", chefId),
          ]);
      if (!recipeResponse.ok) throw new Error("Could not load recipes");
      const payload = (await recipeResponse.json()) as { courses: CourseRow[] };
      setCourses(
        (payload.courses ?? []).map((row) => {
        const stored = Array.isArray(row.recipes)
            ? (row.recipes[0] ?? null)
            : (row.recipes ?? null),
            recipe = stored
              ? ({
                  id: stored.id,
                  menu_course_id: stored.menu_course_id,
                  source: stored.source,
                  base_servings: stored.base_servings,
                  instructions: stored.instructions,
                  ingredients: (stored.recipe_ingredients ?? []).sort(
                    (a, b) => a.sort_order - b.sort_order,
                  ),
                } as Recipe)
              : null,
            derived = deriveCourse(
              {
                slot: row.slot,
                dish_name: row.dish_name,
                dish_origin: row.dish_origin,
                source: row.source,
                component_ids: row.component_ids,
              },
              (signatures ?? []) as Signature[],
              (pantry ?? []) as PantryItem[],
              built,
            );
          return { ...row, recipe, dishExclusions: derived.excludes };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recipes");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function begin(course: LoadedCourse) {
    const eaterCount = dishEaterCount(course, intel);
    setEditing(course.id);
    setViewing(null);
    setDraft(
      course.recipe
        ? {
            baseServings: String(eaterCount),
            ingredientNames: course.recipe.ingredients.map(
              (x) => x.ingredient_name,
            ),
            ingredients: scaleRecipeIngredients(
              course.recipe.ingredients,
              course.recipe.base_servings,
              eaterCount,
            ).map((item) => ({ ...item, quantity_amount: item.scaled_amount })),
            instructions: course.recipe.instructions,
          }
        : {
            ...emptyDraft,
            baseServings: String(eaterCount),
            ingredientNames: [""],
          },
    );
    setError("");
  }
  async function persist(
    courseId: string,
    source: "host_provided" | "ai_generated",
    baseServings: number,
    instructions: string,
    ingredients: RecipeIngredient[],
  ) {
    const userId = localStorage.getItem("sofra_user_id");
    const response = await fetch("/api/recipes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: id,
        userId,
        courseId,
        source,
        baseServings,
        instructions,
        ingredients,
      }),
    });
    if (!response.ok) throw new Error("Could not save recipe");
    await load();
    setEditing(null);
    setViewing(courseId);
  }
  async function saveManual(courseId: string) {
    setBusy(courseId);
    setError("");
    try {
      const course = courses.find((item) => item.id === courseId),
        base = course ? dishEaterCount(course, intel) : Number(draft.baseServings),
        ingredients = draft.ingredients;
      if (
        !ingredients?.length ||
        !Number.isInteger(base) ||
        base <= 0 ||
        !draft.instructions.trim()
      )
        throw new Error(
          "Review the generated quantities and instructions before saving",
        );
      await persist(
        courseId,
        "host_provided",
        base,
        draft.instructions,
        ingredients,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save recipe");
    } finally {
      setBusy(null);
    }
  }
  async function generate(courseId: string, fromDraft = false, rawRecipe = "") {
    setBusy(courseId);
    setError("");
    try {
      const course = courses.find((item) => item.id === courseId),
        targetServings = course
          ? dishEaterCount(course, intel)
          : Math.max(1, intel?.guestCount ?? 4),
        userId = localStorage.getItem("sofra_user_id"),
        ingredientNames = fromDraft
          ? draft.ingredientNames.map((x) => x.trim()).filter(Boolean)
          : [];
      if (
        fromDraft &&
        !rawRecipe &&
        (!ingredientNames.length || !draft.instructions.trim())
      )
        throw new Error(
          "Add at least one ingredient name and general instructions",
        );
      const response = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: id,
          userId,
          courseId,
          ingredientNames: ingredientNames.length ? ingredientNames : undefined,
          instructions: fromDraft ? draft.instructions : undefined,
          rawRecipe: rawRecipe.trim() || undefined,
          baseServings: targetServings,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Could not generate recipe");
      }
      const { recipe } = await response.json();
      setDraft({
        baseServings: String(recipe.base_servings),
        ingredientNames: recipe.ingredients.map(
          (x: RecipeIngredient) => x.ingredient_name,
        ),
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      });
      setViewing(null);
      setEditing(courseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate recipe");
    } finally {
      setBusy(null);
    }
  }

  const dateSub = eventDate
    ? new Date(eventDate).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";
  return (
    <div className={`sv2-root sv2-device-page sv2-app-page sv2-production-menu-draft sv2-production-recipes${restrictedChef ? ' sv2-restricted-chef-page' : ''}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-menu-draft-shell sv2-recipes-shell">
        <ChefTabs
          eventId={id}
          active="recipes"
          restrictedChef={restrictedChef}
          title={eventTitle}
          subtitle={
            dateSub
              ? `${dateSub}${intel ? ` · ${intel.guestCount} covers` : ""}`
              : undefined
          }
        />
        <header className="sv2-recipes-heading">
          <div>
            <h1>Recipes</h1>
            <p>Scaled for {intel?.guestCount ?? 0} guests</p>
          </div>
          <button type="button" className="sv2-recipes-print" onClick={() => window.print()} disabled={!courses.some((course) => course.recipe)}>
            Print recipes
          </button>
        </header>
        {loading && <p>Loading recipes…</p>}
        {error && <p className="sv2-recipe-error">{error}</p>}
        {!loading && courses.length === 0 && (
          <div className="sv2-recipe-empty">
            <h2>Set the table first</h2>
            <p>Generate a menu, then return here to add recipes.</p>
          </div>
        )}
        <section className="sv2-recipes-print-sheet" aria-hidden="true">
          <header>
            <p>Sofra</p>
            <h1>{eventTitle} recipes</h1>
            <span>{dateSub}{dateSub ? " · " : ""}{intel?.guestCount ?? 0} guests</span>
          </header>
          {courses.filter((course) => course.recipe).map((course) => {
            const recipe = course.recipe!;
            const scaledIngredients = scaleRecipeIngredients(recipe.ingredients, recipe.base_servings, dishEaterCount(course, intel));
            return (
              <article key={course.id}>
                <span>{course.slot}</span>
                <h2>{course.dish_name}</h2>
                <ul>
                  {scaledIngredients.map((item) => <li key={item.id ?? item.sort_order}><strong>{amount(item.scaled_amount)} {item.quantity_unit}</strong><span>{item.ingredient_name}</span></li>)}
                </ul>
                <p>{recipe.instructions}</p>
              </article>
            );
          })}
        </section>
        {courses.map((course) => (
          <RecipeCard
            key={course.id}
            course={course}
            intel={intel}
            editing={editing === course.id}
            viewing={viewing === course.id}
            draft={draft}
            setDraft={setDraft}
            begin={() => begin(course)}
              view={() => setViewing((current) => current === course.id ? null : course.id)}
            cancel={() => setEditing(null)}
            save={() => void saveManual(course.id)}
            generate={() => void generate(course.id)}
            prepare={() => void generate(course.id, true)}
            importRecipe={(text) => void generate(course.id, true, text)}
            busy={busy === course.id}
          />
        ))}
      </main>
    </div>
  );
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function RecipeCard({
  course,
  intel,
  editing,
  viewing,
  draft,
  setDraft,
  begin,
  view,
  cancel,
  save,
  generate,
  prepare,
  importRecipe,
  busy,
}: {
  course: LoadedCourse;
  intel: TableIntel | null;
  editing: boolean;
  viewing: boolean;
  draft: Draft;
  setDraft: (x: Draft) => void;
  begin: () => void;
  view: () => void;
  cancel: () => void;
  save: () => void;
  generate: () => void;
  prepare: () => void;
  importRecipe: (text: string) => void;
  busy: boolean;
}) {
  const [listening, setListening] = useState(false),
    [pasteOpen, setPasteOpen] = useState(false),
    [pastedRecipe, setPastedRecipe] = useState(""),
    recognitionRef = useRef<SpeechRecognitionLike | null>(null),
    eaterCount = dishEaterCount(course, intel),
    scaled = useMemo(
      () =>
        course.recipe && intel
          ? scaleRecipeIngredients(
              course.recipe.ingredients,
              course.recipe.base_servings,
              eaterCount,
            )
          : [],
      [course.recipe, intel, eaterCount],
    ),
    warnings = useMemo(
      () =>
        course.recipe && intel
          ? recipeSafetyWarnings(
              course.recipe.ingredients,
              intel,
              course.dishExclusions,
            )
          : [],
      [course.recipe, intel, course.dishExclusions],
    ),
    groupedWarnings = useMemo(() => {
      const groups = new Map<string, { guests: Set<string>; ingredients: Set<string>; dishMetadataGap: boolean }>();
      for (const warning of warnings) {
        const group = groups.get(warning.allergen) ?? { guests: new Set<string>(), ingredients: new Set<string>(), dishMetadataGap: false };
        group.guests.add(warning.guest);
        group.ingredients.add(warning.ingredient);
        group.dishMetadataGap ||= warning.dishMetadataGap;
        groups.set(warning.allergen, group);
      }
      return Array.from(groups, ([allergen, group]) => ({
        allergen,
        guests: new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(Array.from(group.guests)),
        guestCount: group.guests.size,
        ingredients: new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(Array.from(group.ingredients)),
        dishMetadataGap: group.dishMetadataGap,
      }));
    }, [warnings]),
    speechSupported =
      typeof window !== "undefined" &&
      Boolean(
        (
          window as unknown as {
            SpeechRecognition?: SpeechRecognitionConstructor;
            webkitSpeechRecognition?: SpeechRecognitionConstructor;
          }
        ).SpeechRecognition ||
          (
            window as unknown as {
              webkitSpeechRecognition?: SpeechRecognitionConstructor;
            }
          ).webkitSpeechRecognition,
      );
  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as unknown as {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      },
      Ctor =
        speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++)
        if (event.results[i].isFinal)
          transcript += event.results[i][0].transcript;
      setDraft({
        ...draft,
        instructions:
          `${draft.instructions}${draft.instructions ? " " : ""}${transcript}`.trim(),
      });
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    setListening(true);
    recognition.start();
  }
  const instructionField = (
    <label>
      Instructions{" "}
      <small>
        Type or use the microphone to describe the general method Sofra should
        follow.
      </small>
      <div className="sv2-recipe-instruction-tools">
        <textarea
          rows={6}
          value={draft.instructions}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          placeholder="Tell us the general steps to follow. For example: roast until golden, blend the sauce until smooth, then finish with fresh herbs. You can type or speak."
        />
        <button
          type="button"
          className={listening ? "is-listening" : ""}
          onClick={toggleDictation}
          disabled={!speechSupported}
          aria-label={listening ? "Stop recording" : "Start voice input"}
          aria-pressed={listening}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm-1 4.93V22h2v-2.07A8 8 0 0 0 20 12h-2a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93Z" />
          </svg>
        </button>
      </div>
      {listening && <small>Recording. Tap the microphone again to stop.</small>}
      {!speechSupported && (
        <small>
          Voice input is unavailable in this browser. Safari support may be
          limited.
        </small>
      )}
    </label>
  );
  return (
    <article className="sv2-recipe-card sv2-intel-card">
      <div className="sv2-recipe-card-head">
        <div>
          <span>{course.slot}</span>
          <h2>{course.dish_name}</h2>
        </div>
        {course.recipe && (
          <small>
            {course.recipe.source === "ai_generated"
              ? "Generated recipe"
              : "Host recipe"}
          </small>
        )}
      </div>
      {groupedWarnings.map((warning) => (
        <div
          className={
            warning.dishMetadataGap
              ? "sv2-recipe-warning sv2-recipe-warning-gap"
              : "sv2-recipe-warning"
          }
          key={warning.allergen}
        >
          <strong>{warning.allergen} warning</strong>
          <p>
            {warning.guests} {warning.guestCount === 1 ? "has" : "have"} a {warning.allergen} allergy triggered by {warning.ingredients}.
            {warning.dishMetadataGap && (
              <> This dish was not already tagged with {warning.allergen}.</>
            )}
          </p>
        </div>
      ))}
      {course.recipe && !editing && viewing && (
        <>
          <ul className="sv2-recipe-ingredients">
            {scaled.map((item) => (
              <li key={item.id ?? item.sort_order}>
                <strong>
                  {amount(item.scaled_amount)} {item.quantity_unit}
                </strong>
                <span>{item.ingredient_name}</span>
              </li>
            ))}
          </ul>
          <div className="sv2-recipe-instructions">
            {course.recipe.instructions}
          </div>
        </>
      )}
      {editing && (
        <div className="sv2-recipe-form">
          {draft.ingredients === null ? (
            <>
              <p className="sv2-recipe-serving-note">
                This dish will be scaled for <strong>{eaterCount}</strong> {eaterCount === 1 ? "person" : "people"} at the table.
              </p>
              <fieldset className="sv2-recipe-name-list">
                <legend>Ingredients</legend>
                <small>
                  Enter ingredient names only. Add each ingredient on its own
                  row.
                </small>
                {draft.ingredientNames.map((name, index) => (
                  <div className="sv2-recipe-name-row" key={index}>
                    <input
                      aria-label={`Ingredient ${index + 1}`}
                      value={name}
                      placeholder={
                        index === 0 ? "e.g. eggplant" : "Ingredient name"
                      }
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ingredientNames: draft.ingredientNames.map(
                            (item, i) => (i === index ? e.target.value : item),
                          ),
                        })
                      }
                    />
                    {draft.ingredientNames.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ingredient ${index + 1}`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            ingredientNames: draft.ingredientNames.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="sv2-add-ingredient-row"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      ingredientNames: [...draft.ingredientNames, ""],
                    })
                  }
                >
                  Add another ingredient
                </button>
              </fieldset>
              {instructionField}
              <div className="sv2-recipe-actions">
                <button onClick={prepare} disabled={busy}>
                  {busy ? "Generating…" : "Generate recipe"}
                </button>
                <button className="secondary" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="sv2-recipe-review-note">
                Review the suggested quantities, units, allergens, and
                instructions before saving.
              </p>
              <p className="sv2-recipe-serving-note">
                Quantities are automatically scaled for <strong>{eaterCount}</strong> {eaterCount === 1 ? "person" : "people"} eating this dish.
              </p>
              <fieldset className="sv2-recipe-review-list">
                <legend>Ingredients</legend>
                {draft.ingredients.map((item, index) => (
                  <div className="sv2-recipe-review-row" key={index}>
                    <input
                      aria-label={`Ingredient ${index + 1}`}
                      value={item.ingredient_name}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients!.map((x, i) =>
                            i === index
                              ? { ...x, ingredient_name: e.target.value }
                              : x,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`Quantity ${index + 1}`}
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity_amount}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients!.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  quantity_amount: Number(e.target.value),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`Unit ${index + 1}`}
                      value={item.quantity_unit}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients!.map((x, i) =>
                            i === index
                              ? { ...x, quantity_unit: e.target.value }
                              : x,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </fieldset>
              {instructionField}
              <div className="sv2-recipe-actions">
                <button onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save recipe"}
                </button>
                <button className="secondary" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {!editing && (
        <div className="sv2-recipe-actions">
          {course.recipe ? (
            <>
              <button onClick={view}>{viewing ? "Hide recipe" : "View recipe"}</button>
              {viewing && (
                <button className="secondary" onClick={begin}>Edit recipe</button>
              )}
            </>
          ) : (
            <>
              <button onClick={begin}>Scale my own recipe</button>
              <button className="secondary" onClick={generate} disabled={busy}>
                {busy ? "Generating…" : "Generate recipe"}
              </button>
              <button className="secondary" onClick={() => setPasteOpen(true)}>
                Paste a recipe
              </button>
            </>
          )}
        </div>
      )}
      {pasteOpen && (
        <div className="sv2-recipe-modal-backdrop" role="presentation" onMouseDown={() => setPasteOpen(false)}>
          <section className="sv2-recipe-modal" role="dialog" aria-modal="true" aria-labelledby={`paste-recipe-${course.id}`} onMouseDown={(event) => event.stopPropagation()}>
            <h3 id={`paste-recipe-${course.id}`}>Paste a copied recipe</h3>
            <p>Paste the full recipe. Sofra will separate its ingredients, quantities, and instructions, then scale it for your table.</p>
            <textarea rows={12} value={pastedRecipe} onChange={(event) => setPastedRecipe(event.target.value)} placeholder="Paste ingredients and instructions here…" autoFocus />
            <div className="sv2-recipe-actions">
              <button disabled={busy || !pastedRecipe.trim()} onClick={() => { importRecipe(pastedRecipe); setPasteOpen(false) }}>
                {busy ? "Breaking it down…" : "Use this recipe"}
              </button>
              <button className="secondary" onClick={() => setPasteOpen(false)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
