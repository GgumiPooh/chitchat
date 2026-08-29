import {
  EVENT_COLORS,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
} from "@/shared/config";
import { isDayKey } from "@/shared/lib";
import { z } from "zod";

// WARN: `isDayKey`, not a bare pattern — `2026-13-45` matches the shape and still parses to an Invalid Date, which every date helper downstream throws on.
const dayKeySchema = z.string().refine(isDayKey);

/** REQUIREMENTS.md § 11.3. The month the grid is showing, as inclusive day keys. */
export const rangeSchema = z
  .object({ from: dayKeySchema, to: dayKeySchema })
  .refine(({ from, to }) => from <= to);

/**
 * WARN: No `.default()` anywhere in here. `.partial()` does **not** strip a
 * default — it only makes the key optional, so the parse still materialises every
 * default for a key the caller omitted. Built on a defaulted shape,
 * `eventPatchSchema` would turn `PATCH {"title":"새 제목"}` into a body carrying
 * `description: null`, `color: null`, `recurrence: "none"` and `scope: "shared"`,
 * and the UPDATE would wipe all four (REQUIREMENTS.md § 11.4.).
 */
const fieldsSchema = z.object({
  title: z.string().trim().min(1).max(MAX_EVENT_TITLE_LENGTH),
  description: z.string().trim().max(MAX_EVENT_DESCRIPTION_LENGTH).nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  allDay: z.boolean(),
  // WARN: DESIGN.md § 4.1.7. The set is closed here, not at the column — `events.color` is free `text`, so this is the only thing keeping a class name Tailwind never built out of the database.
  color: z.enum(EVENT_COLORS).nullable(),
  // INFO: REQUIREMENTS.md § 6. Three fixed cadences. Never widen this into an RRULE.
  recurrence: z.enum(["none", "weekly", "monthly", "yearly"]),
  scope: z.enum(["shared", "mine"]),
  reminderEnabled: z.boolean(),
});

// INFO: REQUIREMENTS.md § 6. `ends_at` is NOT NULL, so an open-ended event is rejected rather than defaulted — the form is what supplies a sensible end. Only a create defaults, and only the fields a create may legitimately omit.
export const eventBodySchema = fieldsSchema
  .extend({
    description: fieldsSchema.shape.description.default(null),
    allDay: fieldsSchema.shape.allDay.default(false),
    color: fieldsSchema.shape.color.default(null),
    recurrence: fieldsSchema.shape.recurrence.default("none"),
    scope: fieldsSchema.shape.scope.default("shared"),
    reminderEnabled: fieldsSchema.shape.reminderEnabled.default(true),
  })
  .refine(({ startsAt, endsAt }) => startsAt <= endsAt);

/**
 * REQUIREMENTS.md § 11.4. An edit sends only what changed, and an absent key stays
 * absent all the way to the UPDATE.
 *
 * WARN: The ordering check only fires when both ends are present, so a patch
 * moving one of them alone is checked against the stored row by the route rather
 * than here.
 */
export const eventPatchSchema = fieldsSchema
  .partial()
  .refine(
    ({ startsAt, endsAt }) => startsAt === undefined || endsAt === undefined || startsAt <= endsAt,
  );
