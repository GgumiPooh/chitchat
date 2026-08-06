// INFO: The FSD cross-import gate. REQUIREMENTS.md § 12.1.'s 배경으로 설정 writes two `users` columns, so it rides the one `PATCH /api/users/me` client this feature owns rather than growing a second copy of that contract.
export { updateProfile, type ProfileBody } from "../api/write-profile";
