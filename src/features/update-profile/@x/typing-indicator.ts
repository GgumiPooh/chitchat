// INFO: The FSD cross-import gate. REQUIREMENTS.md § 8.12.'s switch is a `users` column, so it rides the one `PATCH /api/users/me` client this feature owns rather than growing a second copy of that contract.
export { updateProfile, type ProfileBody } from "../api/write-profile";
