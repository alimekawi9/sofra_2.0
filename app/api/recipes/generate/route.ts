import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGeminiJson } from "@/lib/gemini";

const ALLERGENS = [
  "nuts",
  "shellfish",
  "dairy",
  "eggs",
  "gluten",
  "soy",
  "sesame",
  "mustard",
  "celery",
  "sulfites",
  "lupin",
  "molluscs",
] as const;
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["baseServings", "instructions", "ingredients"],
  properties: {
    baseServings: { type: "integer", minimum: 1, maximum: 24 },
    instructions: { type: "string" },
    ingredients: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "ingredientName",
          "quantityAmount",
          "quantityUnit",
          "containsAllergens",
        ],
        properties: {
          ingredientName: { type: "string" },
          quantityAmount: { type: "number", minimum: 0 },
          quantityUnit: { type: "string" },
          containsAllergens: {
            type: "array",
            items: { type: "string", enum: ALLERGENS },
          },
        },
      },
    },
  },
} as const;
type Generated = {
  baseServings: number;
  instructions: string;
  ingredients: {
    ingredientName: string;
    quantityAmount: number;
    quantityUnit: string;
    containsAllergens: string[];
  }[];
};

export async function POST(req: Request) {
  let body: {
    eventId?: unknown;
    userId?: unknown;
    courseId?: unknown;
    ingredientNames?: unknown;
    instructions?: unknown;
    rawRecipe?: unknown;
    baseServings?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    typeof body.eventId !== "string" ||
    typeof body.userId !== "string" ||
    typeof body.courseId !== "string"
  )
    return NextResponse.json({ error: "Missing identifiers" }, { status: 400 });
  const ingredientNames = Array.isArray(body.ingredientNames)
      ? body.ingredientNames
          .filter(
            (x): x is string => typeof x === "string" && Boolean(x.trim()),
          )
          .map((x) => x.trim())
      : [],
    instructions =
      typeof body.instructions === "string" ? body.instructions.trim() : "",
    rawRecipe = typeof body.rawRecipe === "string" ? body.rawRecipe.trim() : "",
    requestedServings =
      Number.isInteger(body.baseServings) && Number(body.baseServings) > 0
        ? Number(body.baseServings)
        : null;
  const db = createClient(),
    { data: event } = await db
      .from("events")
      .select("host_id,chef_id")
      .eq("id", body.eventId)
      .maybeSingle();
  const { data: cohost } = !event || event.host_id === body.userId || event.chef_id === body.userId
    ? { data: null }
    : await db.from("event_cohosts").select("user_id").eq("event_id", body.eventId).eq("user_id", body.userId).maybeSingle();
  if (!event || (event.host_id !== body.userId && event.chef_id !== body.userId && !cohost))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: menu } = await db
    .from("menus")
    .select("id")
    .eq("event_id", body.eventId)
    .maybeSingle();
  if (!menu)
    return NextResponse.json({ error: "Menu not found" }, { status: 404 });
  const { data: course } = await db
    .from("menu_courses")
    .select("id,dish_name")
    .eq("id", body.courseId)
    .eq("menu_id", menu.id)
    .maybeSingle();
  if (!course)
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  try {
    const hostContext = rawRecipe
      ? `Parse this copied recipe into the structured response without dropping ingredients or meaningful instructions:\n\n${rawRecipe}\n\nPreserve its stated base serving count when present. If it is absent, use ${requestedServings ?? 4} base servings. Normalize quantities and units only where needed.`
      : ingredientNames.length
        ? `The host supplied these ingredient names and every one must appear once: ${ingredientNames.join(", ")}. Infer plausible quantities and canonical units for them. ${instructions ? `Follow this general method: ${instructions}` : ""} ${requestedServings ? `Use ${requestedServings} base servings.` : ""}`
        : `Choose a practical ingredient list and method for ${requestedServings ?? 4} base servings.`;
    const generated = await callGeminiJson<Generated>(
      `Create one practical home-cook recipe for "${course.dish_name}". ${hostContext} Return exact numeric ingredient quantities and concise numbered instructions. Ingredient allergen labels must use only the schema vocabulary. This is a suggestion that the host will review before saving. Do not perform event scaling and do not claim the recipe is safe.`,
      SCHEMA,
    );
    if (
      !Number.isInteger(generated.baseServings) ||
      generated.baseServings <= 0 ||
      !generated.instructions ||
      !Array.isArray(generated.ingredients) ||
      !generated.ingredients.length
    )
      return NextResponse.json(
        { error: "Invalid generated recipe" },
        { status: 422 },
      );
    const targetServings = requestedServings ?? generated.baseServings;
    const scaleFactor = targetServings / generated.baseServings;
    return NextResponse.json({
      recipe: {
        source: "ai_generated",
        base_servings: targetServings,
        instructions: generated.instructions,
        ingredients: generated.ingredients.map((x, index) => ({
          ingredient_name: x.ingredientName,
          quantity_amount: Math.round(x.quantityAmount * scaleFactor * 1000) / 1000,
          quantity_unit: x.quantityUnit,
          tags: [],
          contains_allergens: x.containsAllergens,
          sort_order: index,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Recipe generation failed",
      },
      { status: 503 },
    );
  }
}
