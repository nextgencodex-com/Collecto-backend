/** "0772458812" / "077 245 8812" -> "077 245 8812"; null if it isn't exactly 10 digits. */
export const formatPhone = (raw: string): string | null => {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3") : null;
};
