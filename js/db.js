class Database {
    constructor() {
        this.dbName = window.KNI_CONFIG.DB_NAME;
        this.dbVersion = window.KNI_CONFIG.DB_VERSION;
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains("models")) {
                    const modelStore = db.createObjectStore("models", { keyPath: "id" });
                    modelStore.createIndex("status", "status", { unique: false });
                }

                if (!db.objectStoreNames.contains("downloads")) {
                    const dlStore = db.createObjectStore("downloads", { keyPath: "id" });
                    dlStore.createIndex("status", "status", { unique: false });
                }

                if (!db.objectStoreNames.contains("conversations")) {
                    const convStore = db.createObjectStore("conversations", { keyPath: "id" });
                    convStore.createIndex("updatedAt", "updatedAt", { unique: false });
                }

                if (!db.objectStoreNames.contains("messages")) {
                    const msgStore = db.createObjectStore("messages", { keyPath: "id" });
                    msgStore.createIndex("conversationId", "conversationId", { unique: false });
                    msgStore.createIndex("timestamp", "timestamp", { unique: false });
                }

                if (!db.objectStoreNames.contains("settings")) {
                    db.createObjectStore("settings", { keyPath: "key" });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    async get(storeName, key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAll(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async put(storeName, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req = store.put(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async delete(storeName, key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}

window.dbInstance = new Database();
