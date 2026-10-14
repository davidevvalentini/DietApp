export type ConfirmOptions = {
  /** Testo del pulsante di conferma (predefinito "Elimina": quasi tutte le
      conferme dell'app sono cancellazioni). */
  confirmLabel?: string;
};
type ConfirmListener = (message: string, resolve: (result: boolean) => void, options: ConfirmOptions) => void;

let listener: ConfirmListener | null = null;

export function registerConfirmListener(fn: ConfirmListener) {
  listener = fn;
}

export function mobileConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!listener) return Promise.resolve(window.confirm(message));
  return new Promise(resolve => listener!(message, resolve, options));
}
