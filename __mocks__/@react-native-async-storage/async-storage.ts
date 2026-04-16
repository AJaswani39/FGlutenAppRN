const storage = new Map<string, string>();

const AsyncStorage = {
  getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    storage.delete(key);
  }),
  clear: jest.fn(async () => {
    storage.clear();
  }),
  __reset: () => {
    storage.clear();
    AsyncStorage.getItem.mockClear();
    AsyncStorage.setItem.mockClear();
    AsyncStorage.removeItem.mockClear();
    AsyncStorage.clear.mockClear();
  },
};

export default AsyncStorage;
