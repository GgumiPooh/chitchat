/**
 * The files a drop or a paste actually carries (REQUIREMENTS.md § 9.2.).
 *
 * WARN: A dropped **folder** arrives as a `File` with no type and no bytes, and
 * uploading it would put an empty object in the bucket under the folder's name.
 * `webkitGetAsEntry` is the only thing that tells the two apart — a real empty file
 * is indistinguishable from a directory by size alone. It answers `null` for a
 * pasted screenshot, which has no entry at all and is not a directory either.
 */
export function toTransferFiles(transfer: DataTransfer): File[] {
  const items = Array.from(transfer.items);

  if (items.length === 0) {
    return Array.from(transfer.files);
  }

  return items.flatMap((item) => {
    const file = item.kind === "file" ? item.getAsFile() : null;

    return file && !item.webkitGetAsEntry()?.isDirectory ? [file] : [];
  });
}
