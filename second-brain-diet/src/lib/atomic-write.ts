import fs from 'fs';

/**
 * Scrittura atomica: file temporaneo + rename.
 *
 * `fs.writeFileSync` tronca il file di destinazione *prima* di scrivere: se il processo
 * muore in mezzo (deploy, OOM, restart di PM2) il file resta troncato e i dati sono persi.
 * Il rename su POSIX è atomico, quindi il file di destinazione o è la versione vecchia
 * o è quella nuova, mai una via di mezzo.
 *
 * Il temporaneo sta nella stessa directory di proposito: rename attraverso filesystem
 * diversi non è atomico (e fallisce con EXDEV).
 */
export function writeFileAtomic(
  filePath: string,
  data: string,
  encoding: BufferEncoding = 'utf-8',
): void {
  // Il pid rende la scrittura sicura anche se due processi scrivono lo stesso file.
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, data, encoding);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* il temporaneo può non esistere */ }
    throw err;
  }
}

/** Come writeFileAtomic, ma serializza l'oggetto con l'indentazione usata ovunque nel progetto. */
export function writeJsonAtomic(filePath: string, value: unknown): void {
  writeFileAtomic(filePath, JSON.stringify(value, null, 2));
}

const locks = new Map<string, Promise<unknown>>();

/**
 * Serializza l'intera transazione lettura→modifica→scrittura per una chiave
 * (di solito il path del file). La sola scrittura atomica protegge il file da
 * corruzioni, non dalle race: due richieste concorrenti possono comunque
 * leggere lo stesso stato di partenza, e l'ultima a scrivere fa sparire in
 * silenzio la modifica dell'altra. Ogni route che fa read→modify→write su un
 * file JSON dovrebbe avvolgere l'intera operazione qui dentro, non solo la
 * write finale.
 */
export function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  locks.set(key, run.then(() => undefined, () => undefined));
  return run;
}
