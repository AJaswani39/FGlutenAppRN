const storage = new Map<string, string>();

const AsyncStorage = {
  getItem: jest.fn(defaultGetItem),
  setItem: jest.fn(defaultSetItem),
  removeItem: jest.fn(defaultRemoveItem),
  clear: jest.fn(defaultClear),
  __reset: () => {
    storage.clear();
    AsyncStorage.getItem.mockReset().mockImplementation(defaultGetItem);
    AsyncStorage.setItem.mockReset().mockImplementation(defaultSetItem);
    AsyncStorage.removeItem.mockReset().mockImplementation(defaultRemoveItem);
    AsyncStorage.clear.mockReset().mockImplementation(defaultClear);
  },
};

async function defaultGetItem(key: string) {
  return storage.get(key) ?? null;
}

async function defaultSetItem(key: string, value: string) {
  storage.set(key, value);
}

async function defaultRemoveItem(key: string) {
  storage.delete(key);
}

async function defaultClear() {
  storage.clear();
}

export default AsyncStorage;
