import "server-only";

import type { SnowflakeId } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 6. The id generator. `43 bits ms | 10 bits machine | 10 bits
 * sequence`, emitted as a decimal string.
 *
 * WARN: Mirrored in jandh-emoticons, which writes the same tables (CLAUDE.md
 * § 4.2.1.). Every constant here is part of the wire format between two
 * deployments — a repository that changes one alone mints colliding ids. Only
 * `MACHINE_BASE` differs, and it is what keeps the two apart.
 */

// INFO: 1990-01-01T00:00:00Z. Far enough back that the first id this app can mint already exceeds 1e18, so every id it will ever hold is 19 digits (§ 6.); the field runs out in 2268.
const EPOCH = 631152000000n;

const TIMESTAMP_SHIFT = 20n;

const MACHINE_SHIFT = 10n;

const SEQUENCE_MASK = 0x3ffn;

// INFO: § 6. jandh takes the lower half of the 10-bit machine space (0–511), jandh-emoticons the upper. Drawn per process because a serverless instance has no stable identity to derive one from.
const MACHINE_BASE = 0;

const MACHINE_RANGE = 512;

const MACHINE_ID = BigInt(MACHINE_BASE + Math.floor(Math.random() * MACHINE_RANGE));

let lastMs = 0n;

let sequence = 0n;

/**
 * A new id. Monotonic within this process, and unique across processes as long as
 * two of them did not draw the same `MACHINE_ID` and collide inside one millisecond
 * — which surfaces as a primary key violation on INSERT rather than as a silently
 * shared id.
 */
export function nextSnowflake<TId extends SnowflakeId>(): TId {
  const now = BigInt(Date.now());

  if (now > lastMs) {
    lastMs = now;
    sequence = 0n;
  } else {
    sequence += 1n;

    // WARN: Runs the clock forward rather than blocking, so an exhausted millisecond (or one the system clock stepped backwards into) still answers. Ids stay unique and ordered; they are merely minted ahead of real time until the wall clock catches up.
    if (sequence > SEQUENCE_MASK) {
      lastMs += 1n;
      sequence = 0n;
    }
  }

  return (
    ((lastMs - EPOCH) << TIMESTAMP_SHIFT) |
    (MACHINE_ID << MACHINE_SHIFT) |
    sequence
  ).toString() as TId;
}
