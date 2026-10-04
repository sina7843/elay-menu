import { reactive } from 'vue';

/** One Toast at a time, named after the item (brand book: «بعد از هر ذخیره یک Toast با نام مورد»). */
export const toast = reactive({ text: '', error: false, link: '' as string | null, id: 0 });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string, opts: { error?: boolean; link?: string | null } = {}) {
  clearTimeout(timer);
  Object.assign(toast, { text, error: !!opts.error, link: opts.link ?? null, id: toast.id + 1 });
  timer = setTimeout(() => (toast.text = ''), opts.error ? 6000 : 4000);
}

export const savedToast = (name: string, link?: string) => showToast(`«${name}» ذخیره شد`, { link: link ?? null });
export const failedToast = (msg = 'ذخیره نشد. اتصال را بررسی کنید و دوباره امتحان کنید.') => showToast(msg, { error: true });
