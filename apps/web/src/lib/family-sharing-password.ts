const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

function secureIndex(length: number): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! % length;
}

export function generateFamilySharingPassword(): string {
  const letters = Array.from({ length: 3 }, () => LETTERS[secureIndex(LETTERS.length)]).join("");
  const digits = Array.from({ length: 4 }, () => DIGITS[secureIndex(DIGITS.length)]).join("");
  return `SubNest-${letters}-${digits}`;
}
