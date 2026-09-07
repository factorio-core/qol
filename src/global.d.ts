declare global {
  interface Storage {
    yafc?: Yafc.StorageSchema;
  }

  const storage: Storage;
}

export {};
