// Persian digits and the «٬» group separator come from the platform's fa-IR locale data.
const num = new Intl.NumberFormat('fa-IR');
const time = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const fa = (n: number) => num.format(n);

/** "۱۸:۰۰" in Tehran time. */
export const faTime = (iso: string) => time.format(new Date(iso));

/** «۶ مورد از ۲ غرفه» */
export const itemsFromStalls = (items: number, stalls: number) => `${fa(items)} مورد از ${fa(stalls)} غرفه`;

/** Closing time: an opening that ends at midnight reads «۲۴:۰۰» (handoff WorkingHours). */
export const faCloseTime = (iso: string) => {
  const t = faTime(iso);
  return t === "۰۰:۰۰" ? "۲۴:۰۰" : t;
};
