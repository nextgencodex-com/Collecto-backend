// The database uses integer keys; the API exposes the prefixed ids the frontend already uses.
export type IdCodec = { format: (n: number) => string; parse: (s: string) => number | null };

const make = (prefix: string): IdCodec => ({
  format: (n: number) => `${prefix}${n}`,
  /** Parses "C101" -> 101; returns null for anything else. */
  parse: (s: string): number | null => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(s);
    return m ? Number(m[1]) : null;
  },
});

export const customerId = make("C");
export const itemId = make("IT");
export const riderId = make("R");
export const paymentId = make("P");
