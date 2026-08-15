export const A_KILOBYTE = 1_024;
export const A_MEGABYTE = 1_024 * A_KILOBYTE;
export const A_GIGABYTE = 1_024 * A_MEGABYTE;

const sizeFormatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

/** `12.4MB`. For upload progress and the over-the-cap message, never for storage. */
export function formatSize(bytes: number): string {
  if (bytes < A_MEGABYTE) {
    return `${sizeFormatter.format(Math.max(bytes, 0) / A_KILOBYTE)}KB`;
  }

  return `${sizeFormatter.format(bytes / A_MEGABYTE)}MB`;
}

/** `1.2GB`. The stored-object sibling of `formatSize`, whose MB ceiling would print four digits for a database dump. */
export function formatStorageSize(bytes: number): string {
  if (bytes < A_GIGABYTE) {
    return formatSize(bytes);
  }

  return `${sizeFormatter.format(bytes / A_GIGABYTE)}GB`;
}
