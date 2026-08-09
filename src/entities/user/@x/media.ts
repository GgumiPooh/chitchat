// INFO: The FSD cross-import gate. `entities/media` names the sender of a library tile (REQUIREMENTS.md § 10.) and needs exactly this one rule from this slice.
// WARN: The **resolver**, never a stored name. REQUIREMENTS.md § 8.7. keeps a display name out of every row and resolves it at read time, so a rename reaches every past tile — exporting the projection instead is how that guarantee gets copied and then goes stale.
export { resolveDisplayName } from "../model/display-name";
